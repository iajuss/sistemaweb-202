import type {
  DossierFieldEnvelope,
  DossierSnapshot,
  PolicyClassification,
} from "@panella/domain";

/**
 * The prompt projection. The consumer of this product is an AI agent, so this
 * text is an output contract like any other: versioned, deterministic and
 * covered by a golden test. A change of wording that nobody noticed would
 * change how every downstream agent behaves.
 *
 * Two rules shape everything below.
 *
 * **Uncertainty is stated, never smoothed.** A field whose link is not
 * confirmed is printed with its link status and the words "não confirmado",
 * and its value is withheld. Presenting a probable match as a fact in prose
 * would re-introduce exactly what the data pipeline refuses to do.
 *
 * **No CPF, whole or masked.** The agent never needs it, and the 4-9 fragment
 * is personal data that has no business leaving the matcher's memory.
 */

export const PROMPT_VERSION = "1.0.0";

function centsToReais(centavos: bigint): string {
  // Integer arithmetic only. A prompt is text, but the number in it came from
  // money, and money never passes through binary floating point here.
  const negative = centavos < 0n;
  const absolute = negative ? -centavos : centavos;
  const reais = absolute / 100n;
  const cents = absolute % 100n;
  return `${negative ? "-" : ""}R$ ${reais}.${cents.toString().padStart(2, "0")}`;
}

function renderValue(envelope: DossierFieldEnvelope): string {
  if (!envelope.vinculoConfirmado) {
    // Withheld on purpose: the value exists, but nobody established it belongs
    // to this person, and printing it invites the agent to use it anyway.
    return "(valor retido: vínculo não confirmado)";
  }
  const valor = envelope.valor;
  if (valor === null) {
    return "(sem valor)";
  }
  switch (valor.tipo) {
    case "MONETARIO_CENTAVOS":
      return centsToReais(valor.centavos);
    case "TEXTO":
      return valor.texto;
    case "BOOLEANO":
      return valor.booleano ? "sim" : "não";
    case "DATA_HORA":
      return valor.dataHora;
    case "LISTA_TEXTO":
      return valor.lista.length === 0 ? "(lista vazia)" : valor.lista.join(", ");
  }
}

function renderField(envelope: DossierFieldEnvelope): string {
  const vinculo = envelope.vinculoConfirmado
    ? `vínculo ${envelope.vinculoStatus}`
    : `vínculo ${envelope.vinculoStatus}, não confirmado`;
  const coletado = envelope.coletadoEm ?? "não coletado";
  return [
    `- **${envelope.campo}** = ${renderValue(envelope)}`,
    `  - estado da fonte: ${envelope.status}`,
    `  - fonte: ${envelope.fonte} (slices: ${envelope.slices.join(", ")})`,
    `  - ${vinculo}, confiança ${envelope.confiancaVinculo}`,
    `  - coletado em: ${coletado}`,
  ].join("\n");
}

function renderCoverage(dossier: DossierSnapshot): string {
  const linhas = dossier.cobertura.fontes.map(
    (fonte) =>
      `- ${fonte.source}: ${fonte.status}` +
      `${fonte.conclusiva ? "" : " (não conclusiva)"}` +
      `${fonte.obrigatoria ? " [obrigatória]" : " [opcional]"}`,
  );
  return linhas.join("\n");
}

export function renderPrompt(
  dossier: DossierSnapshot,
  classification: PolicyClassification,
): string {
  const campos = Object.keys(dossier.campos)
    .sort()
    .map((key) => renderField(dossier.campos[key]));

  const insuficiente = classification.cobertura === "INSUFICIENTE";

  return [
    `# Dossiê ${dossier.dossierId}`,
    "",
    `- prompt_version: ${PROMPT_VERSION}`,
    `- schema_version: ${dossier.schemaVersion}`,
    `- plano de fontes: ${dossier.planVersion}`,
    `- versão do resolvedor: ${dossier.resolverVersion ?? "nenhuma (nada resolvido)"}`,
    `- composto em: ${dossier.composedAt}`,
    "",
    "A data acima é a da composição. Cada campo declara separadamente quando",
    "foi coletado.",
    "",
    "## Cobertura",
    "",
    `Veredito: **${dossier.cobertura.veredito}**`,
    `Slices conclusivas: ${dossier.cobertura.slicesConclusivas} de ${dossier.cobertura.slicesEsperadas}`,
    "",
    renderCoverage(dossier),
    "",
    insuficiente
      ? [
          "**Cobertura insuficiente.** Falha ou ausência de consulta numa fonte",
          "não é indício de mau pagador, e não deve ser lida como nota baixa.",
          "Nenhuma recomendação acionável é emitida neste estado.",
        ].join(" ")
      : "Cobertura suficiente para classificar.",
    "",
    "## Campos",
    "",
    campos.join("\n"),
    "",
    "Campo com vínculo não confirmado tem o valor retido de propósito: alguém",
    "publicou aquele dado, mas ninguém estabeleceu que é desta pessoa.",
    "",
    "## Classificação",
    "",
    `- categoria: **${classification.category}**`,
    `- estratégia primária: **${classification.primary_strategy}**`,
    `- prioridade operacional: ${classification.operational_priority}`,
    `- política: ${classification.policy_version}`,
    `- pontuação: ${classification.score}`,
    `- confiança global: ${classification.confianca_global}`,
    "",
    "A pontuação ordena esforço de cobrança entre devedores. Ela não estima se",
    "alguém vai pagar, e não deve ser apresentada nem usada como se estimasse.",
    "",
    "### Sinais",
    "",
    classification.signals
      .map(
        (signal) =>
          `- ${signal.nome}: ${signal.aplicado ? "aplicado" : "não aplicado"}` +
          `, peso ${signal.peso}, contribuição ${signal.contribuicao}` +
          `, sentido ${signal.sentido}, fonte ${signal.fonte}`,
      )
      .join("\n"),
    "",
    "### Explicação",
    "",
    classification.explicacao,
    "",
  ].join("\n");
}
