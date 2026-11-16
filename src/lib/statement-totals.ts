/** Full-ledger totals, including future charges. Does not replace the server's due-date balance. */
export function statementTotals(
	charges: readonly { amount: number }[],
	payments: readonly { amount: number }[]
) {
	const charged = charges.reduce((sum, charge) => sum + charge.amount, 0);
	const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
	return { charged, paid, ledgerBalance: charged - paid };
}
