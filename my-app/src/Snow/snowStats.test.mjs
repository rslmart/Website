// Run with: node --test src/Snow/snowStats.test.mjs   (from my-app/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    AVERAGE_SEASON,
    MIN_SEASONS_PER_AVERAGE_DAY,
    buildChartRows,
    convertData,
    isSeasonComplete,
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
        // Before the fix single-season tail days swung by up to 220in (White
        // Pass, May). Late-season days averaged over 3-6 seasons still move
        // by up to ~50in as seasons drop out; that survivorship effect is a
        // known follow-up, so this only guards against regressions.
        const values = rows.map(r => r[`${AVERAGE_SEASON}accumulatedSnowFall`]).filter(v => v !== undefined);
        const maxStep = Math.max(...values.slice(1).map((v, i) => Math.abs(v - values[i])));
        assert.ok(maxStep < 60, `${pass} average accumulated jumps ${maxStep.toFixed(1)}in in one day`);
    }
});
