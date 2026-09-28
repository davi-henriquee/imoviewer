"use strict";

const STORAGE_KEY = "meu-proximo-imovel:v1";
const ACCESS_SESSION_KEY = "imoviewer:access-granted";
const ACCESS_PASSWORD = "2007";
const BACKUP_FORMAT = "imoviewer-backup";
const BACKUP_FILE_NAME = "imoviewer.json";
const SCORE_CATEGORY_COUNT = 6;
const LOCATION_SCORES = [0, 25, 50, 75, 100];
const LOCATION_LABELS = [
  "Muito mal localizado",
  "Mal localizado",
  "Localização ok",
  "Bem localizado",
  "Localização privilegiada",
];
const FURNITURE_SCORES = [0, 25, 50, 100];
const FURNITURE_LABELS = [
  "Sem nenhuma mobília",
  "Pouquíssima mobília",
  "Bem mobiliado",
  "Completamente mobiliado",
];

const loginScreen = document.querySelector("#loginScreen");
const loginForm = document.querySelector("#loginForm");
const loginPassword = document.querySelector("#loginPassword");
const loginError = document.querySelector("#loginError");
const form = document.querySelector("#propertyForm");
const propertyValueInput = document.querySelector("#propertyValue");
const condoValueInput = document.querySelector("#condoValue");
const propertySizeInput = document.querySelector("#propertySize");
const waterIncludedInput = document.querySelector("#waterIncluded");
const locationSlider = document.querySelector("#locationSlider");
const furnitureSlider = document.querySelector("#furnitureSlider");
const locationSelection = document.querySelector("#locationSelection");
const furnitureSelection = document.querySelector("#furnitureSelection");
const descriptionInput = document.querySelector("#description");
const descriptionCount = document.querySelector("#descriptionCount");
const contactInput = document.querySelector("#agencyContact");
const photoInput = document.querySelector("#propertyPhoto");
const photoPreview = document.querySelector("#photoPreview");
const photoPlaceholder = document.querySelector("#photoPlaceholder");
const changePhoto = document.querySelector("#changePhoto");
const saveButton = document.querySelector("#saveButton");
const formError = document.querySelector("#formError");
const list = document.querySelector("#propertyList");
const emptyState = document.querySelector("#emptyState");
const cardTemplate = document.querySelector("#propertyCardTemplate");
const savedPropertiesLink = document.querySelector("#savedPropertiesLink");
const exportButton = document.querySelector("#exportButton");
const importButton = document.querySelector("#importButton");
const importInput = document.querySelector("#importInput");
const toast = document.querySelector("#toast");
const scorePanel = document.querySelector(".score-panel-inner");
const scoreOrb = document.querySelector("#scoreOrb");
const liveScore = document.querySelector("#liveScore");
const scoreTitle = document.querySelector("#scoreTitle");
const scoreMessage = document.querySelector("#scoreMessage");

const pointsElements = {
  value: document.querySelector("#valuePoints"),
  condo: document.querySelector("#condoPoints"),
  size: document.querySelector("#sizePoints"),
  location: document.querySelector("#locationPoints"),
  furniture: document.querySelector("#furniturePoints"),
  garage: document.querySelector("#garagePoints"),
  bonus: document.querySelector("#bonusPoints"),
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const decimalFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
});

let properties = loadProperties();
let previewUrl = "";
let toastTimer = 0;
let webMcpRegistered = false;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function roundScore(value) {
  return Math.round(value * 10) / 10;
}

function scoreLowerIsBetter(value, fullScoreAt, zeroScoreAt) {
  if (!Number.isFinite(value)) return null;
  if (value <= fullScoreAt) return 100;
  if (value >= zeroScoreAt) return 0;
  return ((zeroScoreAt - value) / (zeroScoreAt - fullScoreAt)) * 100;
}

function scoreHigherIsBetter(value, zeroScoreAt, fullScoreAt) {
  if (!Number.isFinite(value)) return null;
  if (value <= zeroScoreAt) return 0;
  if (value >= fullScoreAt) return 100;
  return ((value - zeroScoreAt) / (fullScoreAt - zeroScoreAt)) * 100;
}

function getCheckedNumber(name) {
  return Number(form.elements[name].value);
}

function getSliderScore(input, scores) {
  return scores[Number(input.value)] ?? scores[0];
}

function updateSlider(input, output, labels) {
  const index = clamp(Number(input.value), 0, labels.length - 1);
  const progress = labels.length > 1 ? (index / (labels.length - 1)) * 100 : 0;
  output.textContent = labels[index];
  input.setAttribute("aria-valuetext", labels[index]);
  input.style.setProperty("--range-progress", `${progress}%`);
}

function updateSliders() {
  updateSlider(locationSlider, locationSelection, LOCATION_LABELS);
  updateSlider(furnitureSlider, furnitureSelection, FURNITURE_LABELS);
}

function normalizePhoneDigits(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits.length === 12 || digits.length === 13 ? digits : "";
}

function parseInputNumber(input) {
  return input.value.trim() === "" ? Number.NaN : Number(input.value);
}

function getExtraNames(source = form.elements) {
  const extras = [];
  if (source.barbecue.checked) extras.push("Churrasqueira");
  if (source.balcony.checked) extras.push("Sacada");
  if (source.elevator.checked) extras.push("Elevador");
  return extras;
}

function calculateScore(data) {
  const effectiveCondo = Math.max(0, data.condoValue - (data.waterIncluded ? 100 : 0));
  const valueScore = scoreLowerIsBetter(data.propertyValue, 1400, 2000);
  const condoScore = scoreLowerIsBetter(effectiveCondo, 150, 400);
  const sizeScore = scoreHigherIsBetter(data.propertySize, 15, 70);
  const bonus = data.extras.length * 5;
  const scoreParts = [
    valueScore,
    condoScore,
    sizeScore,
    data.location,
    data.furniture,
    data.garage,
  ];
  const complete = scoreParts.every(Number.isFinite);
  const average = complete
    ? scoreParts.reduce((total, value) => total + value, 0) / SCORE_CATEGORY_COUNT
    : null;
  const rawScore = complete ? average + bonus : null;
  const finalScore = complete ? clamp(rawScore, 0, 100) : null;

  return {
    complete,
    effectiveCondo,
    valueScore,
    condoScore,
    sizeScore,
    bonus,
    average,
    rawScore,
    finalScore,
  };
}

function readFormData() {
  return {
    propertyValue: parseInputNumber(propertyValueInput),
    condoValue: parseInputNumber(condoValueInput),
    propertySize: parseInputNumber(propertySizeInput),
    waterIncluded: waterIncludedInput.checked,
    location: getSliderScore(locationSlider, LOCATION_SCORES),
    furniture: getSliderScore(furnitureSlider, FURNITURE_SCORES),
    garage: getCheckedNumber("garage"),
    extras: getExtraNames(),
    description: descriptionInput.value.trim(),
    contact: contactInput.value.trim(),
  };
}

function scoreColor(score) {
  const safeScore = clamp(Number(score) || 0, 0, 100);
  const hue = Math.round((safeScore / 100) * 120);
  const lightness = safeScore > 72 ? 36 : 43;
  return `hsl(${hue} 72% ${lightness}%)`;
}

function scoreCopy(score) {
  if (score >= 85) {
    return ["Excelente opção", "A combinação de custo, espaço e características está muito forte."];
  }
  if (score >= 70) {
    return ["Boa opção", "Este imóvel tem um equilíbrio interessante para sua busca."];
  }
  if (score >= 50) {
    return ["Vale analisar", "Há bons pontos, mas alguns critérios reduzem a nota final."];
  }
  if (score >= 30) {
    return ["Abaixo do ideal", "Compare com cuidado antes de colocar este imóvel entre os favoritos."];
  }
  return ["Pouco competitivo", "Os critérios atuais deixam este imóvel distante do cenário ideal."];
}

function formatPoints(value) {
  if (!Number.isFinite(value)) return "—";
  return decimalFormatter.format(roundScore(value));
}

function updateLiveScore() {
  const data = readFormData();
  const calculation = calculateScore(data);

  pointsElements.value.textContent = formatPoints(calculation.valueScore);
  pointsElements.condo.textContent = formatPoints(calculation.condoScore);
  pointsElements.size.textContent = formatPoints(calculation.sizeScore);
  pointsElements.location.textContent = formatPoints(data.location);
  pointsElements.furniture.textContent = formatPoints(data.furniture);
  pointsElements.garage.textContent = formatPoints(data.garage);
  pointsElements.bonus.textContent = `+${calculation.bonus}`;

  if (!calculation.complete) {
    liveScore.textContent = "—";
    scoreTitle.textContent = "Preencha os valores";
    scoreMessage.textContent = "";
    scoreMessage.hidden = true;
    scorePanel.style.setProperty("--score-color", "#64748b");
    scoreOrb.style.setProperty("--score-progress", "0%");
    return;
  }

  const finalScore = roundScore(calculation.finalScore);
  const [title, message] = scoreCopy(finalScore);
  const color = scoreColor(finalScore);
  liveScore.textContent = decimalFormatter.format(finalScore);
  scoreTitle.textContent = title;
  scoreMessage.textContent = message;
  scoreMessage.hidden = false;
  scorePanel.style.setProperty("--score-color", color);
  scoreOrb.style.setProperty("--score-progress", `${finalScore}%`);
}

function loadProperties() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed)
      ? parsed
          .filter((property) => property && typeof property === "object")
          .map((property) => ({
            ...property,
            extras: Array.isArray(property.extras) ? property.extras : [],
            photo: typeof property.photo === "string" ? property.photo : "",
            contact: typeof property.contact === "string" ? property.contact : "",
          }))
      : [];
  } catch (error) {
    console.warn("Não foi possível carregar os imóveis salvos.", error);
    return [];
  }
}

function persistProperties() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(properties));
}

function labelForScore(score) {
  if (score >= 85) return "Excelente opção";
  if (score >= 70) return "Boa opção";
  if (score >= 50) return "Vale analisar";
  if (score >= 30) return "Abaixo do ideal";
  return "Pouco competitivo";
}

function buildDetailTags(property) {
  const details = [
    `${decimalFormatter.format(property.propertySize)} m²`,
    `${currencyFormatter.format(property.condoValue)} cond.`,
  ];

  if (property.waterIncluded) details.push("Água inclusa");
  if (property.garage === 100) details.push("1 vaga");
  if (property.garage === 200) details.push("2 vagas");
  details.push(...(Array.isArray(property.extras) ? property.extras : []));
  return details;
}

function renderProperties() {
  list.replaceChildren();
  emptyState.hidden = properties.length > 0;
  savedPropertiesLink.setAttribute(
    "aria-label",
    properties.length === 1
      ? "Ver 1 imóvel cadastrado"
      : `Ver ${properties.length} imóveis cadastrados`,
  );

  const fragment = document.createDocumentFragment();

  properties.forEach((property) => {
    const card = cardTemplate.content.firstElementChild.cloneNode(true);
    const image = card.querySelector(".property-image");
    const fallback = card.querySelector(".property-image-fallback");
    const cardScore = card.querySelector(".card-score");
    const roundedScore = roundScore(property.score);

    image.hidden = true;
    fallback.hidden = false;

    if (typeof property.photo === "string" && property.photo.startsWith("data:image/")) {
      image.alt = `Foto do imóvel: ${property.description}`;
      image.onload = () => {
        image.hidden = false;
        fallback.hidden = true;
      };
      image.onerror = () => {
        image.hidden = true;
        fallback.hidden = false;
      };
      image.src = property.photo;
    }

    cardScore.style.setProperty("--card-score-color", scoreColor(roundedScore));
    cardScore.querySelector("strong").textContent = decimalFormatter.format(roundedScore);
    card.querySelector(".property-meta").textContent = `${decimalFormatter.format(property.propertySize)} m²`;
    card.querySelector(".property-price").textContent = currencyFormatter.format(property.propertyValue);
    card.querySelector(".property-description").textContent = property.description;
    card.querySelector(".score-label").textContent = labelForScore(roundedScore);

    const whatsappLink = card.querySelector(".whatsapp-link");
    const whatsappNumber = normalizePhoneDigits(property.contact);
    if (whatsappNumber) {
      const message = `Olá! Tenho interesse neste imóvel: ${property.description.slice(0, 120)}`;
      whatsappLink.href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
      whatsappLink.setAttribute(
        "aria-label",
        `Abrir conversa no WhatsApp com a imobiliária: ${property.contact}`,
      );
      whatsappLink.title = property.contact;
      whatsappLink.hidden = false;
    }

    const detailsContainer = card.querySelector(".property-details");
    buildDetailTags(property).forEach((detail) => {
      const tag = document.createElement("span");
      tag.textContent = detail;
      detailsContainer.append(tag);
    });

    card.querySelector(".delete-button").addEventListener("click", () => {
      const confirmed = window.confirm("Excluir este imóvel da lista?");
      if (!confirmed) return;
      properties = properties.filter((item) => item.id !== property.id);
      try {
        persistProperties();
        renderProperties();
        showToast("Imóvel excluído.");
      } catch (error) {
        showToast("Não foi possível excluir o imóvel.");
      }
    });

    fragment.append(card);
  });

  list.append(fragment);
}

function validateData(data) {
  if (!data.description) return "Escreva uma descrição para o imóvel.";
  if (!Number.isFinite(data.propertyValue) || data.propertyValue <= 0) {
    return "Informe um valor válido para o imóvel.";
  }
  if (!Number.isFinite(data.condoValue) || data.condoValue < 0) {
    return "Informe um valor válido para o condomínio.";
  }
  if (!Number.isFinite(data.propertySize) || data.propertySize <= 0) {
    return "Informe um tamanho válido para o imóvel.";
  }
  if (data.contact && !normalizePhoneDigits(data.contact)) {
    return "Informe um contato válido com DDD, por exemplo: (11) 99999-9999.";
  }
  return "";
}

function fileToOptimizedDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("O arquivo selecionado não é uma imagem válida."));
      image.onload = () => {
        const maxSide = 900;
        const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * ratio));
        canvas.height = Math.max(1, Math.round(image.height * ratio));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Não foi possível processar a imagem."));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.76));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function resetPhotoPreview() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = "";
  photoPreview.removeAttribute("src");
  photoPreview.hidden = true;
  photoPlaceholder.hidden = false;
  changePhoto.hidden = true;
}

function resetForm() {
  form.reset();
  form.elements.location.value = "2";
  form.elements.furniture.value = "0";
  form.elements.garage.value = "0";
  descriptionCount.textContent = "0";
  resetPhotoPreview();
  updateSliders();
  updateLiveScore();
}

function showError(message) {
  formError.textContent = message;
  formError.hidden = !message;
  if (message) formError.scrollIntoView({ behavior: "smooth", block: "center" });
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function unlockApp() {
  try {
    sessionStorage.setItem(ACCESS_SESSION_KEY, "granted");
  } catch (error) {
    console.warn("Não foi possível manter o acesso durante a sessão.", error);
  }
  document.body.classList.remove("is-locked");
  loginScreen.hidden = true;
  registerWebMcpTools();
}

function initializeAccess() {
  try {
    if (sessionStorage.getItem(ACCESS_SESSION_KEY) === "granted") {
      unlockApp();
      return;
    }
  } catch (error) {
    console.warn("Não foi possível consultar o acesso da sessão.", error);
  }
  loginScreen.hidden = false;
  window.requestAnimationFrame(() => loginPassword.focus());
}

function handleLogin(event) {
  event.preventDefault();
  if (loginPassword.value === ACCESS_PASSWORD) {
    loginError.hidden = true;
    loginPassword.value = "";
    unlockApp();
    window.requestAnimationFrame(() => propertyValueInput.focus());
    return;
  }
  loginError.hidden = false;
  loginPassword.value = "";
  loginPassword.focus();
}

function sanitizeBackupProperty(item, index) {
  if (!item || typeof item !== "object") {
    throw new Error(`O imóvel ${index + 1} do arquivo é inválido.`);
  }

  const data = {
    description: String(item.description || "").trim().slice(0, 500),
    propertyValue: Number(item.propertyValue),
    condoValue: Number(item.condoValue),
    propertySize: Number(item.propertySize),
    waterIncluded: Boolean(item.waterIncluded),
    location: Number(item.location),
    furniture: Number(item.furniture),
    garage: Number(item.garage),
    contact: String(item.contact || "").trim().slice(0, 20),
    extras: Array.isArray(item.extras)
      ? item.extras.filter((extra) => ["Churrasqueira", "Sacada", "Elevador"].includes(extra))
      : [],
  };

  const validationMessage = validateData(data);
  if (validationMessage) throw new Error(`Imóvel ${index + 1}: ${validationMessage}`);
  if (![0, 25, 50, 75, 100].includes(data.location)) {
    throw new Error(`Imóvel ${index + 1}: localização inválida.`);
  }
  if (![0, 25, 50, 100].includes(data.furniture)) {
    throw new Error(`Imóvel ${index + 1}: mobília inválida.`);
  }
  if (![0, 100, 200].includes(data.garage)) {
    throw new Error(`Imóvel ${index + 1}: garagem inválida.`);
  }

  const photo =
    typeof item.photo === "string" && item.photo.startsWith("data:image/") ? item.photo : "";
  const property = createPropertyRecord(data, photo);
  property.id = typeof item.id === "string" && item.id ? item.id : createId();
  property.createdAt =
    typeof item.createdAt === "string" && Number.isFinite(Date.parse(item.createdAt))
      ? item.createdAt
      : new Date().toISOString();
  return property;
}

function mergeImportedProperties(importedProperties) {
  const previousProperties = properties;
  const byId = new Map(properties.map((property) => [property.id, property]));
  importedProperties.forEach((property) => byId.set(property.id, property));
  properties = Array.from(byId.values()).sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
  );

  try {
    persistProperties();
  } catch (storageError) {
    properties = previousProperties;
    throw new Error("Não há espaço suficiente no navegador para carregar estes imóveis.");
  }

  renderProperties();
}

function exportBackup() {
  const backup = {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    properties,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = BACKUP_FILE_NAME;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  showToast(`${properties.length} ${properties.length === 1 ? "imóvel exportado" : "imóveis exportados"}.`);
}

async function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());
    if (parsed?.format !== BACKUP_FORMAT || !Array.isArray(parsed.properties)) {
      throw new Error("Este arquivo não é um backup válido do Imoviewer.");
    }

    const importedProperties = parsed.properties.map(sanitizeBackupProperty);
    mergeImportedProperties(importedProperties);
    showToast(
      `${importedProperties.length} ${
        importedProperties.length === 1 ? "imóvel importado" : "imóveis importados"
      } com sucesso.`,
    );
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Não foi possível importar o backup.");
  } finally {
    importInput.value = "";
  }
}

async function loadBundledBackup() {
  try {
    const response = await fetch(`./${BACKUP_FILE_NAME}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Resposta ${response.status}`);
    const parsed = await response.json();
    if (parsed?.format !== BACKUP_FORMAT || !Array.isArray(parsed.properties)) {
      throw new Error("Formato inválido");
    }

    const bundledProperties = parsed.properties.map(sanitizeBackupProperty);
    if (bundledProperties.length > 0) mergeImportedProperties(bundledProperties);
  } catch (error) {
    if (window.location.protocol !== "file:") {
      console.warn(`Não foi possível carregar ${BACKUP_FILE_NAME}.`, error);
    }
  }
}

function createPropertyRecord(data, photo = "") {
  const calculation = calculateScore(data);
  if (!calculation.complete) throw new Error("Não foi possível calcular a pontuação.");
  return {
    id: createId(),
    createdAt: new Date().toISOString(),
    description: data.description,
    propertyValue: data.propertyValue,
    condoValue: data.condoValue,
    propertySize: data.propertySize,
    waterIncluded: data.waterIncluded,
    location: data.location,
    furniture: data.furniture,
    garage: data.garage,
    contact: data.contact || "",
    extras: data.extras,
    photo,
    score: roundScore(calculation.finalScore),
    scoreDetails: {
      value: roundScore(calculation.valueScore),
      condo: roundScore(calculation.condoScore),
      size: roundScore(calculation.sizeScore),
      bonus: calculation.bonus,
    },
  };
}

async function handleSubmit(event) {
  event.preventDefault();
  showError("");
  const data = readFormData();
  const validationMessage = validateData(data);

  if (validationMessage) {
    showError(validationMessage);
    return;
  }

  saveButton.disabled = true;
  saveButton.querySelector("span").textContent = "Salvando...";

  try {
    const photoFile = photoInput.files?.[0];
    const photo = photoFile ? await fileToOptimizedDataUrl(photoFile) : "";
    const property = createPropertyRecord(data, photo);
    properties.unshift(property);

    try {
      persistProperties();
    } catch (storageError) {
      properties.shift();
      throw new Error(
        "O navegador ficou sem espaço para salvar. Tente uma foto menor ou exclua um imóvel antigo.",
      );
    }

    renderProperties();
    resetForm();
    showToast(`Imóvel salvo com nota ${decimalFormatter.format(property.score)}.`);
    document.querySelector("#lista-imoveis").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showError(error instanceof Error ? error.message : "Não foi possível salvar o imóvel.");
  } finally {
    saveButton.disabled = false;
    saveButton.querySelector("span").textContent = "Salvar imóvel";
  }
}

function normalizeToolData(input) {
  const extras = Array.isArray(input.extras)
    ? input.extras.filter((item) => ["Churrasqueira", "Sacada", "Elevador"].includes(item))
    : [];
  return {
    description: String(input.descricao || "").trim(),
    propertyValue: Number(input.valor_imovel),
    condoValue: Number(input.valor_condominio),
    propertySize: Number(input.tamanho_m2),
    waterIncluded: Boolean(input.agua_inclusa),
    location: Number(input.localizacao),
    furniture: Number(input.mobilia),
    garage: Number(input.garagem),
    contact: String(input.contato_imobiliaria || "").trim().slice(0, 20),
    extras,
  };
}

function registerWebMcpTools() {
  if (webMcpRegistered) return;
  const context = document.modelContext;
  if (!context?.registerTool) return;
  webMcpRegistered = true;

  const lifecycle = new AbortController();
  const register = (tool) => {
    try {
      void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {});
    } catch (error) {
      console.warn("Não foi possível registrar uma ferramenta do navegador.", error);
    }
  };

  register({
    name: "cadastrar_imovel",
    title: "Cadastrar imóvel",
    description: "Cadastra um imóvel, calcula a nota e atualiza a lista visível.",
    inputSchema: {
      type: "object",
      properties: {
        descricao: { type: "string", minLength: 1, maxLength: 500 },
        valor_imovel: { type: "number", minimum: 0 },
        valor_condominio: { type: "number", minimum: 0 },
        tamanho_m2: { type: "number", exclusiveMinimum: 0 },
        agua_inclusa: { type: "boolean" },
        localizacao: { type: "number", enum: [0, 25, 50, 75, 100] },
        mobilia: { type: "number", enum: [0, 25, 50, 100] },
        garagem: { type: "number", enum: [0, 100, 200] },
        contato_imobiliaria: {
          type: "string",
          maxLength: 20,
          description: "Telefone opcional da imobiliária, com DDD.",
        },
        extras: {
          type: "array",
          uniqueItems: true,
          items: { type: "string", enum: ["Churrasqueira", "Sacada", "Elevador"] },
        },
      },
      required: [
        "descricao",
        "valor_imovel",
        "valor_condominio",
        "tamanho_m2",
        "agua_inclusa",
        "localizacao",
        "mobilia",
        "garagem",
      ],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute(input) {
      const data = normalizeToolData(input);
      const validationMessage = validateData(data);
      if (validationMessage) throw new Error(validationMessage);
      if (![0, 25, 50, 75, 100].includes(data.location)) throw new Error("Localização inválida.");
      if (![0, 25, 50, 100].includes(data.furniture)) throw new Error("Mobília inválida.");
      if (![0, 100, 200].includes(data.garage)) throw new Error("Garagem inválida.");

      const property = createPropertyRecord(data);
      properties.unshift(property);
      persistProperties();
      renderProperties();
      showToast(`Imóvel salvo com nota ${decimalFormatter.format(property.score)}.`);
      return { id: property.id, nota: property.score, total_imoveis: properties.length };
    },
  });

  register({
    name: "listar_imoveis",
    title: "Listar imóveis",
    description: "Lista os imóveis salvos e suas notas atuais.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute() {
      return properties.map((property) => ({
        id: property.id,
        descricao: property.description,
        valor_imovel: property.propertyValue,
        contato_imobiliaria: property.contact,
        nota: property.score,
      }));
    },
  });
}

form.addEventListener("input", () => {
  showError("");
  descriptionCount.textContent = String(descriptionInput.value.length);
  updateSliders();
  updateLiveScore();
});

form.addEventListener("change", updateLiveScore);
form.addEventListener("submit", handleSubmit);
loginForm.addEventListener("submit", handleLogin);
loginPassword.addEventListener("input", () => {
  loginError.hidden = true;
});
exportButton.addEventListener("click", exportBackup);
importButton.addEventListener("click", () => importInput.click());
importInput.addEventListener("change", importBackup);

photoInput.addEventListener("change", () => {
  resetPhotoPreview();
  const file = photoInput.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    photoInput.value = "";
    showError("Selecione um arquivo de imagem válido.");
    return;
  }
  previewUrl = URL.createObjectURL(file);
  photoPreview.src = previewUrl;
  photoPreview.hidden = false;
  photoPlaceholder.hidden = true;
  changePhoto.hidden = false;
});

renderProperties();
updateSliders();
updateLiveScore();
initializeAccess();
void loadBundledBackup();
