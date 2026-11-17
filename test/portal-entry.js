import { PortalApi } from '../src/api.js';
import { DataStore, meterPointsFrom, loadView, computeStats, applyFilters, mergeSum, dailyProfile, carpet, weekdayAverages, likeForLikeCut, forecast, seriesOnAxis, bucketAxis } from '../src/model.js';
import { makePeriod, comparePeriod } from '../src/time.js';
const http = async ({ method = 'GET', url, headers = {}, data }) => {
  const r = await fetch(url, { method, headers, body: data !== undefined ? JSON.stringify(data) : undefined });
  const t = await r.text(); let d = t; try { d = JSON.parse(t); } catch {}
  return { status: r.status, data: d };
};
window.SB = { PortalApi, DataStore, meterPointsFrom, loadView, computeStats, applyFilters, mergeSum, dailyProfile, carpet, weekdayAverages, likeForLikeCut, forecast, seriesOnAxis, bucketAxis, makePeriod, comparePeriod, http };
