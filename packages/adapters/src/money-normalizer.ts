// Single rule, one home. The normalizer moved to the domain when the wallet
// importer needed it, because rejecting a malformed amount is an invariant and
// `packages/domain` cannot import from this layer.
export { normalizeSpreadsheetMoney } from "@panella/domain";
