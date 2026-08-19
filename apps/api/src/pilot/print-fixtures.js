import { createPilotFixtures } from './pilot-fixtures.js';

const count = Number(process.env.PILOT_SESSIONS ?? 20);
const issuedAt = process.env.PILOT_ISSUED_AT ?? new Date().toISOString();
const seed = process.env.PILOT_SEED ?? 'acceptance';
console.log(JSON.stringify(createPilotFixtures({ count, issuedAt, seed }), null, 2));
