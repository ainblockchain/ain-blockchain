const UNITS_PER_AIN = 1000000;

function toMicroUnits(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('nonnegative finite AIN amount required');
  }
  const fixed = value.toFixed(6);
  if (!/^\d+\.\d{6}$/.test(fixed) || Number(fixed) !== value) {
    throw new Error('canonical six-decimal AIN amount required');
  }
  const units = Number(fixed.replace('.', ''));
  if (!Number.isSafeInteger(units)) throw new Error('AIN amount exceeds exact micro-unit range');
  return units;
}

function fromMicroUnits(units) {
  if (!Number.isSafeInteger(units) || units < 0) throw new Error('invalid micro-unit amount');
  const value = units / UNITS_PER_AIN;
  if (toMicroUnits(value) !== units) throw new Error('micro-unit amount cannot round-trip as AIN');
  return value;
}

function transferBalances(fromBalance, toBalance, amount,
    { fromEscrow = true, toEscrow = true } = {}) {
  const recipient = toBalance === null ? 0 : toBalance;
  for (const balance of [fromBalance, recipient]) {
    if (typeof balance !== 'number' || !Number.isFinite(balance) || balance < 0) {
      throw new Error('invalid native account balance');
    }
  }
  const amountUnits = toMicroUnits(amount);
  if (amountUnits <= 0 || amount > fromBalance) throw new Error('invalid escrow transfer amount');
  const balances = {
    from: fromEscrow ? fromMicroUnits(toMicroUnits(fromBalance) - amountUnits) :
      fromBalance - amount,
    to: toEscrow ? fromMicroUnits(toMicroUnits(recipient) + amountUnits) : recipient + amount,
  };
  if (Math.round((fromBalance - balances.from) * UNITS_PER_AIN) !== amountUnits ||
      Math.round((balances.to - recipient) * UNITS_PER_AIN) !== amountUnits) {
    throw new Error('native account cannot represent the transfer in micro-units');
  }
  return balances;
}

function releaseAmounts(value, escrowBalance) {
  if (!value || value.version !== 2 || Object.keys(value).sort().join(',') !==
      'source_units,target_units,version') throw new Error('version2 micro-unit release required');
  const source = fromMicroUnits(value.source_units);
  const target = fromMicroUnits(value.target_units);
  const total = value.source_units + value.target_units;
  if (!Number.isSafeInteger(total) || total <= 0 || total !== toMicroUnits(escrowBalance)) {
    throw new Error('release must conserve funded micro-units');
  }
  return { source, target };
}

module.exports = { toMicroUnits, fromMicroUnits, transferBalances, releaseAmounts };
