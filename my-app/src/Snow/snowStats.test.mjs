// @vitest-environment node
// Run with: npm test   (from my-app/). Migrated from node --test to Vitest.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    AVERAGE_SEASON,
    EL_NINO_AVG,
    LA_NINA_AVG,
    MAX_LOW_SAMPLE_STEP_INCHES,
    MIN_SEASONS_PER_AVERAGE_DAY,
    buildChartRows,
    convertData,
    isSeasonComplete,
    months,
    pickExtremeSeasons,
    resolveSeason,
} from './snowStats.js';

const AFTER_ALL_SEASONS = new Date(2030, 0, 1);

// One month of daily readings; accumulated grows by `perDay` each day.
const month = (name, days, perDay = 1, start = 0) => ({
    month: name,
    dailySnowFall: Array.from({ length: days }, (_, i) => ({
        day: i + 1,
        newDailySnowFall: perDay,
        totalSnowFall: start + perDay * (i + 1),
        accumulatedSnowFall: start + perDay * (i + 1),
    })),
});
const fullSeason = (perDay, febDays = 28) => [
    month('Nov', 30, perDay),
    month('Dec', 31, perDay, perDay * 30),
    month('Jan', 31, perDay, perDay * 61),
    month('Feb', febDays, perDay, perDay * 92),
    month('Mar', 31, perDay, perDay * (92 + febDays)),
];

test('resolveSeason falls back to the newest season with data', () => {
    const stevens = { 2004: fullSeason(1), 2025: fullSeason(1), 2026: [] };
    assert.equal(resolveSeason(stevens, '2000'), '2025'); // Snoqualmie-only season
    assert.equal(resolveSeason(stevens, '2004'), '2004');
    assert.equal(resolveSeason(stevens, '2026'), '2025'); // empty [] season
    assert.equal(resolveSeason(stevens, null), '2025');
    assert.equal(resolveSeason({}, '2000'), null);
});

test('switching to a pass without the chosen season does not throw', () => {
    const data = {
        Snoqualmie: { 2000: fullSeason(2), 2005: fullSeason(1) },
        Stevens: { 2004: fullSeason(1), 2005: fullSeason(3) },
    };
    const passData = data.Stevens;
    const [chartData, peaks] = convertData('Stevens', data);
    const season = resolveSeason(passData, '2000');
    const { highestSeason, lowestSeason } = pickExtremeSeasons(passData, peaks, AFTER_ALL_SEASONS);
    const rows = buildChartRows(chartData, [season, highestSeason, lowestSeason, AVERAGE_SEASON].filter(Boolean));
    assert.equal(season, '2005');
    assert.ok(rows.some(row => row['2005accumulatedSnowFall'] !== undefined));
});

test('lowest season skips empty, gappy and in-progress seasons', () => {
    const passData = {
        2019: fullSeason(2),
        2020: fullSeason(1),                       // genuine lowest
        2021: [month('Nov', 30, 0.5)],             // no Dec-Mar data
        2022: [],                                  // empty
        2023: fullSeason(0.25),                    // still in progress below
    };
    const [, peaks] = convertData('P', { P: passData });
    const midWinter2023 = new Date(2024, 1, 15);
    const { highestSeason, lowestSeason } = pickExtremeSeasons(passData, peaks, midWinter2023);
    assert.equal(lowestSeason, '2020');
    assert.equal(highestSeason, '2019');
    assert.equal(isSeasonComplete('2023', passData[2023], midWinter2023), false);
    assert.equal(isSeasonComplete('2023', passData[2023], new Date(2024, 6, 1)), true);
});

test('averages omit Feb 29 and days with fewer than 3 seasons', () => {
    const passData = {
        2018: fullSeason(1),
        2019: fullSeason(1, 29),   // leap winter (Feb 2020)
        2020: fullSeason(1),
        2021: [...fullSeason(1), month('Apr', 5, 1, 200)], // only season with April
    };
    const [chartData] = convertData('P', { P: passData });
    const average = chartData[AVERAGE_SEASON].map(d => d.name);
    assert.ok(!average.includes('29-Feb'));
    assert.ok(!average.includes('1-Apr'));      // 1 season < MIN_SEASONS_PER_AVERAGE_DAY
    assert.ok(average.includes('28-Feb'));
    assert.ok(chartData['2019'].some(d => d.name === '29-Feb')); // season line keeps it
    assert.equal(MIN_SEASONS_PER_AVERAGE_DAY, 3);
});

test('real data: every pass/season switch works and averages have no spikes', () => {
    const data = JSON.parse(readFileSync(new URL('../../public/snow/pass_snowfall_data.json', import.meta.url)));
    const allSeasons = new Set(Object.values(data).flatMap(Object.keys));
    for (const pass of Object.keys(data)) {
        const [chartData, peaks] = convertData(pass, data);
        const { highestSeason, lowestSeason } = pickExtremeSeasons(data[pass], peaks);
        assert.ok(highestSeason && lowestSeason, pass);
        for (const requested of allSeasons) {
            const season = resolveSeason(data[pass], requested);
            assert.ok(season in data[pass], `${pass} ${requested}`);
            buildChartRows(chartData, [season, highestSeason, lowestSeason, AVERAGE_SEASON]);
        }
        const avg = chartData[AVERAGE_SEASON];
        assert.ok(!avg.some(d => d.name === '29-Feb'), pass);
        const rows = buildChartRows(chartData, [AVERAGE_SEASON]);
        const at = name => rows.find(r => r.name === name)[`${AVERAGE_SEASON}accumulatedSnowFall`];
        // Before the fix Stevens jumped +68.8in into 29-Feb and back.
        assert.ok(Math.abs(at('1-Mar') - at('28-Feb')) < 10, `${pass} 28-Feb -> 1-Mar`);
        for (const key of [AVERAGE_SEASON, LA_NINA_AVG, EL_NINO_AVG]) {
            for (const field of ['accumulatedSnowFall', 'totalSnowFall']) {
                const step = maxThinSampleStep(chartData[key], field);
                assert.ok(
                    step <= MAX_LOW_SAMPLE_STEP_INCHES,
                    `${pass} ${key} ${field} moves ${step.toFixed(1)}in where n is 3–6`,
                );
            }
        }
        assert.ok(avg.some(d => d.lowConfidence), `${pass} has a thin-sample day`);
        assert.ok(avg.some(d => !d.lowConfidence), `${pass} has a well-sampled day`);
        assert.equal(MAX_LOW_SAMPLE_STEP_INCHES, 12);
    }
});

// Largest step between consecutive baseline points where either day has
// only 3–6 seasons. That is the step the dashed line actually draws.
const maxThinSampleStep = (series, field) => {
    let max = 0;
    for (let i = 1; i < series.length; i++) {
        const prev = series[i - 1];
        const cur = series[i];
        if (prev.seasonsUsed > 6 && cur.seasonsUsed > 6) continue;
        max = Math.max(max, Math.abs(cur[field] - prev[field]));
    }
    return max;
};

test('a thin late-season sample cannot cliff the accumulated average', () => {
    const light = [...fullSeason(1), month('Apr', 30, 1, 200)];
    const heavy = [...fullSeason(10), month('Apr', 30, 1, 2000), month('May', 10, 1, 2030)];
    const passData = {
        2010: light, 2011: light, 2012: light,
        2013: heavy, 2014: heavy, 2015: heavy,
    };
    const [chartData] = convertData('P', { P: passData });
    const avg = chartData[AVERAGE_SEASON];
    const apr30 = avg.find(d => d.name === '30-Apr');
    const may1 = avg.find(d => d.name === '1-May');
    assert.equal(apr30.seasonsUsed, 6);
    assert.equal(may1.seasonsUsed, 3);
    assert.ok(may1.lowConfidence);
    // The three heavy seasons are still near 2030in; the old mean of
    // season-to-date totals jumped by hundreds of inches on 1 May.
    assert.ok(Math.abs(may1.accumulatedSnowFall - apr30.accumulatedSnowFall) <= MAX_LOW_SAMPLE_STEP_INCHES);
    assert.ok(Math.abs(may1.totalSnowFall - apr30.totalSnowFall) <= MAX_LOW_SAMPLE_STEP_INCHES);
});

test('September and June readings are charted', () => {
    assert.equal(months[0], 'Sep');
    assert.equal(months.at(-1), 'Jun');
    const data = JSON.parse(readFileSync(new URL('../../public/snow/pass_snowfall_data.json', import.meta.url)));
    const [stevens] = convertData('Stevens_Pass_US-2', data);
    const [snoqualmie] = convertData('Snoqualmie_Pass_I-90', data);
    const hasMonth = (chartData, month) => Object.entries(chartData)
        .filter(([season]) => season !== AVERAGE_SEASON && season !== LA_NINA_AVG && season !== EL_NINO_AVG)
        .some(([, rows]) => rows.some(d => d.name.endsWith(`-${month}`)));
    assert.ok(hasMonth(stevens, 'Sep'), 'Stevens September readings');
    assert.ok(hasMonth(snoqualmie, 'Jun'), 'Snoqualmie June readings');
    const rows = buildChartRows(snoqualmie, ['2011', AVERAGE_SEASON]);
    assert.ok(rows.some(r => r.name === '1-Jun' && r['2011accumulatedSnowFall'] !== undefined));
    assert.ok(rows.some(r => r.lowConfidence), 'thin June days are flagged for the shade');
});
