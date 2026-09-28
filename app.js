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
const SCORE_CATEGORIES = [
  { key: "best", min: 91, range: "91–100", label: "Os melhores" },
  { key: "excellent", min: 81, range: "81–90", label: "Excelente opção" },
  { key: "good", min: 71, range: "71–80", label: "Boa opção" },
  { key: "observe", min: 61, range: "61–70", label: "Vale observação" },
  { key: "bad", min: 51, range: "51–60", label: "Opção ruim" },
  { key: "terrible", min: 0, range: "0–50", label: "Péssima opção" },
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
const websiteInput = document.querySelector("#propertyWebsite");
const photoInput = document.querySelector("#propertyPhoto");
const photoPreview = document.querySelector("#photoPreview");
const photoPlaceholder = document.querySelector("#photoPlaceholder");
const changePhoto = document.querySelector("#changePhoto");
const saveButton = document.querySelector("#saveButton");
const cancelEditButton = document.querySelector("#cancelEditButton");
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
const overviewDialog = document.querySelector("#propertyOverviewDialog");
const overviewCloseButton = document.querySelector("#overviewCloseButton");
const overviewScoreOrb = document.querySelector("#overviewScoreOrb");
const overviewScore = document.querySelector("#overviewScore");
const overviewTitle = document.querySelector("#overviewTitle");
const overviewRange = document.querySelector("#overviewRange");
const overviewDescription = document.querySelector("#overviewDescription");
const overviewPrice = document.querySelector("#overviewPrice");

const overviewPointsElements = {
  value: document.querySelector("#overviewValuePoints"),
  condo: document.querySelector("#overviewCondoPoints"),
  size: document.querySelector("#overviewSizePoints"),
  location: document.querySelector("#overviewLocationPoints"),
  furniture: document.querySelector("#overviewFurniturePoints"),
  garage: document.querySelector("#overviewGaragePoints"),
  bonus: document.querySelector("#overviewBonusPoints"),
};

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
let editingPropertyId = "";
let editingPhoto = "";

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
  document.querySelectorAll(`[data-slider="${input.id}"]`).forEach((option) => {
    const selected = Number(option.dataset.value) === index;
    option.classList.toggle("is-selected", selected);
    option.setAttribute("aria-pressed", String(selected));
  });
}

function updateSliders() {
  updateSlider(locationSlider, locationSelection, LOCATION_LABELS);
  updateSlider(furnitureSlider, furnitureSelection, FURNITURE_LABELS);
}

function normalizeWebsiteUrl(value) {
  const trimmedValue = String(value || "").trim();
  if (!trimmedValue) return "";
  const valueWithProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmedValue)
    ? trimmedValue
    : `https://${trimmedValue}`;

  try {
    const url = new URL(valueWithProtocol);
    return ["http:", "https:"].includes(url.protocol) && url.hostname ? url.href : "";
  } catch (error) {
    return "";
  }
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
    website: websiteInput.value.trim(),
  };
}

function scoreColor(score) {
  const safeScore = clamp(Number(score) || 0, 0, 100);
  const hue = Math.round((safeScore / 100) * 120);
  const lightness = safeScore > 72 ? 36 : 43;
  return `hsl(${hue} 72% ${lightness}%)`;
}

function scoreCopy(score) {
  const category = scoreCategory(score);
  const messages = {
    best: "Este imóvel reúne a combinação mais forte entre os critérios avaliados.",
    excellent: "A combinação de custo, espaço e características está muito forte.",
    good: "Este imóvel tem um equilíbrio interessante para sua busca.",
    observe: "Há bons pontos, mas alguns critérios merecem uma análise mais cuidadosa.",
    bad: "Alguns critérios importantes reduzem bastante a nota final.",
    terrible: "Os critérios atuais deixam este imóvel distante do cenário ideal.",
  };
  return [category.label, messages[category.key]];
}

function scoreCategory(score) {
  const safeScore = clamp(Math.round(Number(score) || 0), 0, 100);
  return SCORE_CATEGORIES.find((category) => safeScore >= category.min) || SCORE_CATEGORIES.at(-1);
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

  const finalScore = Math.round(calculation.finalScore);
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
            website: normalizeWebsiteUrl(property.website || property.link || ""),
            score: Math.round(Number(property.score) || 0),
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
  return scoreCategory(score).label;
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

function createPropertyCard(property) {
  const card = cardTemplate.content.firstElementChild.cloneNode(true);
  const image = card.querySelector(".property-image");
  const fallback = card.querySelector(".property-image-fallback");
  const cardScore = card.querySelector(".card-score");
  const roundedScore = Math.round(Number(property.score) || 0);

  card.tabIndex = 0;
  card.title = "Clique para ver os detalhes da nota";
  card.setAttribute("aria-label", `Ver detalhes da nota: ${property.description}`);

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

  const webLink = card.querySelector(".web-link");
  const website = normalizeWebsiteUrl(property.website);
  if (website) {
    webLink.href = website;
    webLink.setAttribute("aria-label", `Abrir anúncio em nova aba: ${property.description}`);
    webLink.title = website;
    webLink.hidden = false;
  }

  const detailsContainer = card.querySelector(".property-details");
  buildDetailTags(property).forEach((detail) => {
    const tag = document.createElement("span");
    tag.textContent = detail;
    detailsContainer.append(tag);
  });

  card.querySelector(".edit-button").addEventListener("click", () => {
    startEditing(property);
  });

  card.querySelector(".delete-button").addEventListener("click", () => {
    const confirmed = window.confirm("Excluir este imóvel da lista?");
    if (!confirmed) return;
    properties = properties.filter((item) => item.id !== property.id);
    try {
      persistProperties();
      if (editingPropertyId === property.id) resetForm();
      renderProperties();
      showToast("Imóvel excluído.");
    } catch (error) {
      showToast("Não foi possível excluir o imóvel.");
    }
  });

  card.addEventListener("click", (event) => {
    if (event.target.closest("a, button")) return;
    openPropertyOverview(property);
  });

  card.addEventListener("keydown", (event) => {
    if (event.target !== card || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    openPropertyOverview(property);
  });

  return card;
}

function openPropertyOverview(property) {
  const calculation = calculateScore(property);
  const roundedScore = Math.round(calculation.finalScore ?? property.score);
  const category = scoreCategory(roundedScore);
  const color = scoreColor(roundedScore);

  overviewDescription.textContent = property.description;
  overviewPrice.textContent = `${currencyFormatter.format(property.propertyValue)} · ${decimalFormatter.format(property.propertySize)} m²`;
  overviewScore.textContent = decimalFormatter.format(roundedScore);
  overviewTitle.textContent = category.label;
  overviewRange.textContent = `Faixa ${category.range}`;
  overviewDialog.style.setProperty("--overview-score-color", color);
  overviewScoreOrb.style.setProperty("--overview-score-color", color);
  overviewScoreOrb.style.setProperty("--overview-score-progress", `${roundedScore}%`);
  overviewPointsElements.value.textContent = formatPoints(calculation.valueScore);
  overviewPointsElements.condo.textContent = formatPoints(calculation.condoScore);
  overviewPointsElements.size.textContent = formatPoints(calculation.sizeScore);
  overviewPointsElements.location.textContent = formatPoints(property.location);
  overviewPointsElements.furniture.textContent = formatPoints(property.furniture);
  overviewPointsElements.garage.textContent = formatPoints(property.garage);
  overviewPointsElements.bonus.textContent = `+${calculation.bonus}`;

  if (typeof overviewDialog.showModal === "function") {
    overviewDialog.showModal();
  } else {
    overviewDialog.setAttribute("open", "");
  }
}

function closePropertyOverview() {
  if (typeof overviewDialog.close === "function") {
    overviewDialog.close();
  } else {
    overviewDialog.removeAttribute("open");
  }
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

  SCORE_CATEGORIES.forEach((category) => {
    const categoryProperties = properties
      .filter((property) => scoreCategory(property.score).key === category.key)
      .sort((left, right) => {
        const scoreDifference = Number(right.score) - Number(left.score);
        if (scoreDifference !== 0) return scoreDifference;
        return Date.parse(right.updatedAt || right.createdAt) - Date.parse(left.updatedAt || left.createdAt);
      });
    if (categoryProperties.length === 0) return;

    const section = document.createElement("section");
    section.className = "property-category";
    section.style.setProperty("--category-color", scoreColor(category.min));

    const heading = document.createElement("div");
    heading.className = "category-divider";
    heading.innerHTML = `
      <h3>${category.label} <small>${category.range}</small></h3>
      <span aria-hidden="true"></span>
      <p>${categoryProperties.length} ${categoryProperties.length === 1 ? "imóvel" : "imóveis"}</p>
    `;

    const cards = document.createElement("div");
    cards.className = "category-cards";
    categoryProperties.forEach((property) => cards.append(createPropertyCard(property)));
    section.append(heading, cards);
    fragment.append(section);
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
  if (data.website && !normalizeWebsiteUrl(data.website)) {
    return "Informe um link válido, por exemplo: https://exemplo.com/anuncio.";
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
  editingPropertyId = "";
  editingPhoto = "";
  form.classList.remove("is-editing");
  cancelEditButton.hidden = true;
  saveButton.querySelector("span").textContent = "Salvar imóvel";
  form.reset();
  form.elements.location.value = "2";
  form.elements.furniture.value = "0";
  form.elements.garage.value = "0";
  descriptionCount.textContent = "0";
  resetPhotoPreview();
  updateSliders();
  updateLiveScore();
}

function startEditing(property) {
  editingPropertyId = property.id;
  editingPhoto = typeof property.photo === "string" ? property.photo : "";

  propertyValueInput.value = String(property.propertyValue);
  condoValueInput.value = String(property.condoValue);
  propertySizeInput.value = String(property.propertySize);
  waterIncludedInput.checked = Boolean(property.waterIncluded);
  locationSlider.value = String(Math.max(0, LOCATION_SCORES.indexOf(property.location)));
  furnitureSlider.value = String(Math.max(0, FURNITURE_SCORES.indexOf(property.furniture)));
  form.elements.garage.value = String(property.garage);
  form.elements.barbecue.checked = property.extras.includes("Churrasqueira");
  form.elements.balcony.checked = property.extras.includes("Sacada");
  form.elements.elevator.checked = property.extras.includes("Elevador");
  descriptionInput.value = property.description;
  websiteInput.value = property.website || "";
  photoInput.value = "";

  resetPhotoPreview();
  if (editingPhoto.startsWith("data:image/")) {
    photoPreview.src = editingPhoto;
    photoPreview.hidden = false;
    photoPlaceholder.hidden = true;
    changePhoto.hidden = false;
  }

  form.classList.add("is-editing");
  cancelEditButton.hidden = false;
  saveButton.querySelector("span").textContent = "Atualizar imóvel";
  descriptionCount.textContent = String(descriptionInput.value.length);
  showError("");
  updateSliders();
  updateLiveScore();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => propertyValueInput.focus(), 350);
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
    website: String(item.website || item.link || "").trim().slice(0, 500),
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
    website: normalizeWebsiteUrl(data.website),
    extras: data.extras,
    photo,
    score: Math.round(calculation.finalScore),
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
  const isEditing = Boolean(editingPropertyId);
  saveButton.querySelector("span").textContent = isEditing ? "Atualizando..." : "Salvando...";

  try {
    const photoFile = photoInput.files?.[0];
    const photo = photoFile ? await fileToOptimizedDataUrl(photoFile) : editingPhoto;
    const property = createPropertyRecord(data, photo);
    const previousProperties = properties;

    if (isEditing) {
      const propertyIndex = properties.findIndex((item) => item.id === editingPropertyId);
      if (propertyIndex === -1) throw new Error("Este imóvel não está mais disponível para edição.");
      const originalProperty = properties[propertyIndex];
      property.id = originalProperty.id;
      property.createdAt = originalProperty.createdAt;
      property.updatedAt = new Date().toISOString();
      properties = properties.map((item, index) => (index === propertyIndex ? property : item));
    } else {
      properties = [property, ...properties];
    }

    try {
      persistProperties();
    } catch (storageError) {
      properties = previousProperties;
      throw new Error(
        "O navegador ficou sem espaço para salvar. Tente uma foto menor ou exclua um imóvel antigo.",
      );
    }

    renderProperties();
    resetForm();
    showToast(
      `Imóvel ${isEditing ? "atualizado" : "salvo"} com nota ${decimalFormatter.format(property.score)}.`,
    );
    document.querySelector("#lista-imoveis").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showError(error instanceof Error ? error.message : "Não foi possível salvar o imóvel.");
  } finally {
    saveButton.disabled = false;
    saveButton.querySelector("span").textContent = editingPropertyId
      ? "Atualizar imóvel"
      : "Salvar imóvel";
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
    website: String(input.link_web || "").trim().slice(0, 500),
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
        link_web: {
          type: "string",
          maxLength: 500,
          description: "Link opcional do anúncio do imóvel.",
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
        link_web: property.website,
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
cancelEditButton.addEventListener("click", () => {
  resetForm();
  showError("");
  showToast("Edição cancelada.");
});
overviewCloseButton.addEventListener("click", closePropertyOverview);
overviewDialog.addEventListener("click", (event) => {
  if (event.target === overviewDialog) closePropertyOverview();
});
document.querySelectorAll("[data-slider]").forEach((option) => {
  option.addEventListener("click", () => {
    const slider = document.getElementById(option.dataset.slider);
    if (!slider) return;
    slider.value = option.dataset.value;
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.focus();
  });
});
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
