// Pure data logic for the Snow page (no React), so it can be unit-tested with
// `node --test src/Snow/snowStats.test.mjs`.

// Pseudo-season keys for the computed baselines.
export const AVERAGE_SEASON = 'Average';
export const LA_NINA_AVG = 'La Nina avg';
export const EL_NINO_AVG = 'El Nino avg';

// September and June stay on the chart so early and late readings are not
// dropped. Many passes recorded only a few of those days.
export const months = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
export const days_in_a_month = [30, 31, 30, 31, 31, 28, 31, 30, 31, 30];

// A baseline day needs at least this many seasons behind it; with fewer the
// "average" is one or two winters and swings wildly at the season edges.
export const MIN_SEASONS_PER_AVERAGE_DAY = 3;

// Days backed by this many seasons or fewer are a thin sample. The chart
// shades them, and the average line may not move more than
// MAX_LOW_SAMPLE_STEP_INCHES from the previous plotted day.
export const LOW_CONFIDENCE_MAX_SEASONS = 6;

// Day-to-day cap (inches) when either day has only 3–6 seasons. It sits above
// the largest one-day change in this record where at least 7 seasons reported
// (about 10 inches of snow depth, about 5 inches of new snow) and below the
// old thin-sample cliffs of about 50 inches.
export const MAX_LOW_SAMPLE_STEP_INCHES = 12;

// The heart of the winter: a complete season has data in each of these.
const CORE_MONTHS = ['Dec', 'Jan', 'Feb', 'Mar'];

const dailyEntries = (seasonData, month) => {
    const monthData = (seasonData || []).find(obj => obj.month === month);
    return (monthData && Array.isArray(monthData.dailySnowFall)) ? monthData.dailySnowFall : [];
};

// True when a season has at least one daily reading in the charted months.
export const seasonHasData = (seasonData) =>
    months.some(month => dailyEntries(seasonData, month).length > 0);

// Season "YYYY" is the winter starting in autumn YYYY; it is over once its
// spring has passed (1 July of YYYY+1).
export const isSeasonOver = (season, now = new Date()) =>
    now >= new Date(Number(season) + 1, 6, 1);

// A season counts for the "lowest season" ranking only once it is over and
// has data in every core winter month. In-progress, empty ([]) and gappy
// seasons would otherwise win "lowest" just for missing data.
export const isSeasonComplete = (season, seasonData, now = new Date()) =>
    isSeasonOver(season, now)
    && CORE_MONTHS.every(month => dailyEntries(seasonData, month).length > 0);

// Newest season (by year) that has any data for this pass, or null.
export const newestSeasonWithData = (passData) =>
    Object.keys(passData || {})
        .filter(season => seasonHasData(passData[season]))
        .sort()
        .pop() ?? null;

const monthPriority = {};
months.forEach((month, index) => {
    monthPriority[month] = index;
});

// Custom sort function for objects with a 'name' property ("day-Mon").
export function customDateSort(a, b) {
    const [aDay, aMonth] = a.name.split('-');
    const [bDay, bMonth] = b.name.split('-');

    // Get priorities (default to Infinity for unknown months)
    const aPriority = monthPriority[aMonth] ?? Infinity;
    const bPriority = monthPriority[bMonth] ?? Infinity;

    // Compare by month priority first
    if (aPriority !== bPriority) {
        return aPriority - bPriority;
    }

    // If same month, compare by day
    const aDayNum = parseInt(aDay, 10);
    const bDayNum = parseInt(bDay, 10);
    return aDayNum - bDayNum;
}

// Pull `value` to within MAX_LOW_SAMPLE_STEP_INCHES of the previous point.
const clampStep = (value, previous) => {
    const delta = value - previous
    if (Math.abs(delta) <= MAX_LOW_SAMPLE_STEP_INCHES) return value
    return previous + Math.sign(delta) * MAX_LOW_SAMPLE_STEP_INCHES
}

// Builds per-season chart series plus the baseline averages for one pass.
// `phaseOf(season)` returns 'La Nina', 'El Nino', 'Neutral' or null.
export const convertData = (passName, data, phaseOf = () => null) => {
    const chartData = {}
    const passData = (data && data[passName]) || {};
    const highestPerYear_accumulatedSnowFall = {}
    const highestPerYear_totalSnowFall = {}

    // Per-calendar-day (`${day}-${month}`) accumulators for the baseline
    // averages: one bucket across every season, plus ONI-classified La Nina
    // and El Nino buckets. New snow and snow depth are averaged per day.
    // Accumulated snowfall is the running sum of those daily new-snow means,
    // so a winter dropping out of the sample cannot yank the line.
    const buckets = {
        [AVERAGE_SEASON]: { sum: {}, count: {} },
        [LA_NINA_AVG]: { sum: {}, count: {} },
        [EL_NINO_AVG]: { sum: {}, count: {} },
    }
    const addToBucket = (key, name, daily) => {
        const b = buckets[key]
        if (!b.sum[name]) {
            b.sum[name] = { newDailySnowFall: 0, totalSnowFall: 0, accumulatedSnowFall: 0 }
            b.count[name] = 0
        }
        b.sum[name].newDailySnowFall += daily['newDailySnowFall']
        b.sum[name].totalSnowFall += daily['totalSnowFall']
        b.sum[name].accumulatedSnowFall += daily['accumulatedSnowFall']
        b.count[name] += 1
    }

    Object.entries(passData).forEach(([season, seasonData]) => {
        chartData[season] = []
        const phase = phaseOf(season)
        const highest_accumulatedSnowFall = {
            "season": season,
            "month": '',
            "day": 0,
            "amount": 0
        }
        const highest_totalSnowFall = {
            "season": season,
            "month": '',
            "day": 0,
            "amount": 0
        }
        months.forEach(month => {
            dailyEntries(seasonData, month).forEach(dailySnow => {
                const name = `${dailySnow['day']}-${month}`
                chartData[season].push({
                    'name': name,
                    'newDailySnowFall': dailySnow['newDailySnowFall'],
                    'totalSnowFall': dailySnow['totalSnowFall'],
                    'accumulatedSnowFall': dailySnow['accumulatedSnowFall'],
                })
                if (dailySnow["accumulatedSnowFall"] > highest_accumulatedSnowFall["amount"]) {
                    highest_accumulatedSnowFall["amount"] = dailySnow["accumulatedSnowFall"]
                    highest_accumulatedSnowFall["day"] = dailySnow["day"]
                    highest_accumulatedSnowFall["month"] = month
                }
                if (dailySnow["totalSnowFall"] > highest_totalSnowFall["amount"]) {
                    highest_totalSnowFall["amount"] = dailySnow["totalSnowFall"]
                    highest_totalSnowFall["day"] = dailySnow["day"]
                    highest_totalSnowFall["month"] = month
                }
                // Feb 29 exists only in leap winters, so its "average" would
                // be a different subset of seasons than its neighbours (the
                // old +69in spike). Leave it out; the line joins 28 Feb to
                // 1 Mar.
                if (month === 'Feb' && Number(dailySnow['day']) === 29) return
                addToBucket(AVERAGE_SEASON, name, dailySnow)
                if (phase === 'La Nina') addToBucket(LA_NINA_AVG, name, dailySnow)
                if (phase === 'El Nino') addToBucket(EL_NINO_AVG, name, dailySnow)
            })
        })
        highestPerYear_accumulatedSnowFall[season] = highest_accumulatedSnowFall
        highestPerYear_totalSnowFall[season] = highest_totalSnowFall
    })

    // Days backed by fewer than MIN_SEASONS_PER_AVERAGE_DAY seasons are
    // dropped, as is Feb 29 (already skipped above).
    const baselineSeries = (bucket) => {
        const names = Object.keys(bucket.sum)
            .filter(name => bucket.count[name] >= MIN_SEASONS_PER_AVERAGE_DAY)
            .sort((a, b) => customDateSort({ name: a }, { name: b }))
        let accumulated = 0
        let prev = null
        // Snow depth is a level, not a sum. After a thin-sample cliff, walk
        // back toward the raw mean instead of snapping on the next well
        // sampled day.
        let depthHeld = false
        return names.map(name => {
            const seasonsUsed = bucket.count[name]
            const sum = bucket.sum[name]
            const newDailySnowFall = sum.newDailySnowFall / seasonsUsed
            accumulated += newDailySnowFall
            const thinSample = seasonsUsed <= LOW_CONFIDENCE_MAX_SEASONS
                || (prev && prev.seasonsUsed <= LOW_CONFIDENCE_MAX_SEASONS)
            if (prev && thinSample) accumulated = clampStep(accumulated, prev.accumulatedSnowFall)
            let totalSnowFall = sum.totalSnowFall / seasonsUsed
            if (prev && (thinSample || depthHeld)) {
                const stepped = clampStep(totalSnowFall, prev.totalSnowFall)
                depthHeld = stepped !== totalSnowFall
                totalSnowFall = stepped
            } else {
                depthHeld = false
            }
            const point = {
                name,
                newDailySnowFall,
                totalSnowFall,
                accumulatedSnowFall: accumulated,
                seasonsUsed,
                lowConfidence: seasonsUsed <= LOW_CONFIDENCE_MAX_SEASONS,
            }
            prev = point
            return point
        })
    }
    chartData[AVERAGE_SEASON] = baselineSeries(buckets[AVERAGE_SEASON])
    chartData[LA_NINA_AVG] = baselineSeries(buckets[LA_NINA_AVG])
    chartData[EL_NINO_AVG] = baselineSeries(buckets[EL_NINO_AVG])

    return [chartData, highestPerYear_accumulatedSnowFall, highestPerYear_totalSnowFall]
}

// Picks the highest and lowest seasons by peak accumulated snowfall.
// Highest considers every season with data (a partial season that already
// beats the record is the record); lowest considers complete seasons only.
// Either is null when no season qualifies.
export const pickExtremeSeasons = (passData, highestPerYear, now = new Date()) => {
    let highest = null;
    let lowest = null;
    Object.entries(highestPerYear).forEach(([season, peak]) => {
        const seasonData = passData[season];
        if (!seasonHasData(seasonData)) return;
        if (!highest || peak.amount > highest.amount) highest = peak;
        if (isSeasonComplete(season, seasonData, now) && (!lowest || peak.amount < lowest.amount)) {
            lowest = peak;
        }
    });
    return {
        highestSeason: highest ? highest.season : null,
        lowestSeason: lowest ? lowest.season : null,
    };
}

// Season to show after switching pass/season: the requested one if this pass
// has data for it, otherwise the pass's newest season with data.
export const resolveSeason = (passData, requestedSeason) =>
    (requestedSeason && seasonHasData((passData || {})[requestedSeason]))
        ? requestedSeason
        : newestSeasonWithData(passData);

// The season before the one on the chart, when this pass recorded it.
export const previousSeasonWithData = (passData, season) => {
    const year = Number(season);
    if (!Number.isInteger(year)) return null;
    const key = String(year - 1);
    return seasonHasData((passData || {})[key]) ? key : null;
};

// Newest season in this list that has an ONI anomaly. The current snowfall
// season can start before that winter's DJF value exists.
export const latestOniSeason = (oniMap, seasonKeys) => {
    const known = (seasonKeys || []).filter((season) => {
        const anom = oniMap?.[season];
        return anom !== undefined && anom !== null && anom !== '';
    });
    if (!known.length) return null;
    return known.sort().at(-1);
};

// Merges the chosen series into one row per calendar day for Recharts.
export const buildChartRows = (chartData, seasons) => {
    const finalData = [];
    months.forEach((month, month_number) => {
        for (let i = 1; i <= days_in_a_month[month_number]; i++) {
            finalData.push({ 'name': `${i}-${month}` })
        }
    })
    const byName = new Map(finalData.map(row => [row.name, row]));
    seasons.forEach(season => {
        (chartData[season] || []).forEach((dailySnow) => {
            let row = byName.get(dailySnow.name);
            if (!row) {
                row = { name: dailySnow.name };
                byName.set(row.name, row);
                finalData.push(row);
            }
            row[season + 'newDailySnowFall'] = dailySnow['newDailySnowFall']
            row[season + 'totalSnowFall'] = dailySnow['totalSnowFall']
            row[season + 'accumulatedSnowFall'] = dailySnow['accumulatedSnowFall']
            // Shade only the all-season average. The ENSO averages are thin
            // across most of the winter, and shading those would cover the chart.
            if (season === AVERAGE_SEASON && dailySnow.lowConfidence) row.lowConfidence = true
        })
    })
    finalData.sort(customDateSort)
    return finalData;
}
