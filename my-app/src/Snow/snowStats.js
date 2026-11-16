// Pure data logic for the Snow page (no React), so it can be unit-tested with
// `node --test src/Snow/snowStats.test.mjs`.

// Pseudo-season keys for the computed baselines.
export const AVERAGE_SEASON = 'Average';
export const LA_NINA_AVG = 'La Nina avg';
export const EL_NINO_AVG = 'El Nino avg';

export const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
export const days_in_a_month = [31, 30, 31, 31, 28, 31, 30, 31];

// A baseline day needs at least this many seasons behind it; with fewer the
// "average" is one or two winters and swings wildly at the season edges.
export const MIN_SEASONS_PER_AVERAGE_DAY = 3;

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

// Builds per-season chart series plus the baseline averages for one pass.
// `phaseOf(season)` returns 'La Nina', 'El Nino', 'Neutral' or null.
export const convertData = (passName, data, phaseOf = () => null) => {
    const chartData = {}
    const passData = (data && data[passName]) || {};
    const highestPerYear_accumulatedSnowFall = {}
    const highestPerYear_totalSnowFall = {}

    // Per-calendar-day (`${day}-${month}`) accumulators for the baseline
    // averages: one bucket across every season, plus ONI-classified La Nina
    // and El Nino buckets. Each is summed here and divided into a mean below.
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

    // Build each baseline pseudo-season from its per-day accumulators,
    // dropping days backed by too few seasons.
    const bucketToSeries = (bucket) => Object.keys(bucket.sum)
        .filter(name => bucket.count[name] >= MIN_SEASONS_PER_AVERAGE_DAY)
        .map(name => ({
            name,
            newDailySnowFall: bucket.sum[name].newDailySnowFall / bucket.count[name],
            totalSnowFall: bucket.sum[name].totalSnowFall / bucket.count[name],
            accumulatedSnowFall: bucket.sum[name].accumulatedSnowFall / bucket.count[name],
        }))
    chartData[AVERAGE_SEASON] = bucketToSeries(buckets[AVERAGE_SEASON])
    chartData[LA_NINA_AVG] = bucketToSeries(buckets[LA_NINA_AVG])
    chartData[EL_NINO_AVG] = bucketToSeries(buckets[EL_NINO_AVG])

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
        })
    })
    finalData.sort(customDateSort)
    return finalData;
}
