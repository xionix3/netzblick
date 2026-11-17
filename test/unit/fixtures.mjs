// Antworten im Format des echten Portals (Struktur am 17.11.2026 mitgeschnitten, Werte anonymisiert)

export const MP1 = 'AT0090000000000000000000000000001';
export const MP2 = 'AT0090000000000000000000000000002';

const vids = (category) => [
  { identifier: '1-0:1.8.0*H15', type: 'MeterReadingSequence', unit: 'kWh', color: null, legend: '1-0:1.8.0*H15', tariffName: null, co2Emission: null, category, cumulative: true, isActiveEnergy: true, measuringIntervalSeconds: 900, startTimestamp: '2023-06-20T22:00:00.000Z', endTimestamp: '2100-01-01T00:00:00.000Z' },
  { identifier: '1-0:1.8.1*H24', type: 'MeterReadingSequence', unit: 'kWh', color: null, legend: '1-0:1.8.1*H24', tariffName: null, co2Emission: null, category, cumulative: true, isActiveEnergy: true, measuringIntervalSeconds: 86400, startTimestamp: '2018-06-25T22:00:00.000Z', endTimestamp: '2100-01-01T00:00:00.000Z' },
  { identifier: '1-0:1.8.2*H24', type: 'MeterReadingSequence', unit: 'kWh', color: null, legend: '1-0:1.8.2*H24', tariffName: null, co2Emission: null, category, cumulative: true, isActiveEnergy: true, measuringIntervalSeconds: 86400, startTimestamp: '2018-06-25T22:00:00.000Z', endTimestamp: '2100-01-01T00:00:00.000Z' },
];

const operMode = (mp, category) => ({
  legend: category === 'Balance' ? 'Bilanz' : 'Verbrauch',
  measuringPointIdentifier: null,
  meteringPointIdentifier: mp,
  meteringPointName: null,
  meteringPointDisplayName: mp,
  category,
  tariffName: null,
  devicesWithPeriod: null,
  address: { street: 'Musterstraße', houseNumber: mp === MP1 ? '1' : '1a', postalCode: '7000', city: 'Eisenstadt' },
  valueIdentifiers: vids(category === 'Balance' ? 'Consumption' : null),
  ...(category === 'Balance' ? { selectedInExtBal: true } : {}),
});

export const ACCOUNT = {
  identifier: '100001',
  email: '',
  salutation: 'Herrn',
  displayName: 'Max Muster',
  token: 'Bearer test-token-1',
  operModesAtMeterPts: [operMode(MP1, 'Consumption'), operMode(MP1, 'Balance'), operMode(MP2, 'Consumption'), operMode(MP2, 'Balance')],
};

export const LOGIN_OK = {
  data: { linkedAccounts: [ACCOUNT], cognitoToken: { idToken: 'x', refreshToken: 'y', expireIn: 3600 } },
  success: true,
  message: null,
  mustChangePassword: false,
};

// wörtlich so vom Portal bei falschem Passwort (HTTP 400)
export const LOGIN_INVALID = {
  data: null,
  success: false,
  message: '{"status":401,"errorCode":"ErrCodeUserPasswordInvalid","message":"failed email/password invalid","messages":null}',
  mustChangePassword: false,
};

export function seriesResponse(valueIdentifier, points) {
  return [{
    name: 'Verbrauch', data: points.map((p) => ({
      startTimestamp: p.start, endTimestamp: p.end, value: p.value, reading: p.reading ?? null,
      powerValue: null, price: null, emission: null, status: p.status ?? 'W', readingStatus: null,
    })), deviceExceptionStatus: null, isBasePrice: false, valueIdentifier, isEmpty: points.length === 0,
  }];
}

export const MAX_POWER = { value: 13.932000000029802, startTimestamp: '2026-11-03T16:30:00+00:00', endTimestamp: '2026-11-03T16:45:00+00:00', status: 'W', legend: '1-0:1.8.0*H15' };
