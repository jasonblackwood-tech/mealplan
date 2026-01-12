/* Grade 4 Meal Plan Checker
   - Uses USDA FoodData Central API (v1) endpoints:
     * POST /v1/foods/search
     * GET  /v1/food/{fdcId}
   - Stores only: API key + targets + meal plan in browser localStorage (no server storage).
*/
const LS_KEY = "g4_mealplanner_v1";

// TEACHER SETUP: paste your USDA FoodData Central API key here.
// NOTE: This key will be visible to anyone who can view the page source.
const FDC_API_KEY = "PASTE_KEY_HERE";

const DEFAULT_LIMITS = {
  // For Grade 4 (ages 9–10), these are typically aligned with the 9–13 life stage in DRI tables.
  // You can change these at any time. Values are daily caps.
  ul: {
    // Units: match the nutrient units shown.
    vitA_ugRAE: 1700,   // µg RAE (UL for 9–13)
    vitD_ug: 100,       // µg
    iron_mg: 40,        // mg
    zinc_mg: 23,        // mg
    calcium_mg: 3000,   // mg
    sodium_mg: 2300     // mg (everyday limit-style cap)
  },
  limits: {
    // These are “limits” (not DRIs/ULs). They’re percent of energy.
    addedSugar_pctEnergy: 10,
    satFat_pctEnergy: 10
  }
};

const STATE = loadState();

const els = {
  meal: document.getElementById("meal"),
  query: document.getElementById("query"),
  searchBtn: document.getElementById("searchBtn"),
  results: document.getElementById("results"),
  plan: document.getElementById("plan"),
  check: document.getElementById("check"),
  saveTargetsBtn: document.getElementById("saveTargetsBtn"),
  clearAllBtn: document.getElementById("clearAllBtn"),
  exportBtn: document.getElementById("exportBtn"),
  exportArea: document.getElementById("exportArea"),
  printBtn: document.getElementById("printBtn"),
  addWaterBtn: document.getElementById("addWaterBtn"),
  waterDlg: document.getElementById("waterDlg"),
  waterMl: document.getElementById("waterMl"),
  // dialog
  dlg: document.getElementById("amountDlg"),
  dlgTitle: document.getElementById("dlgTitle"),
  portionSel: document.getElementById("portionSel"),
  portionCount: document.getElementById("portionCount"),
  portionBox: document.getElementById("portionBox"),
  gramsBox: document.getElementById("gramsBox"),
  grams: document.getElementById("grams"),
  portionHint: document.getElementById("portionHint"),
  dlgAddBtn: document.getElementById("dlgAddBtn"),
};

const targetFields = [
  "t_cal","t_water","t_protein","t_carbs","t_fat",
  "t_vita","t_vitd","t_calcium","t_iron","t_zinc","t_sodium"
];

let pendingFood = null; // {fdcId, description, dataType, brandOwner, portions, gramsPerServingGuess}

init();

function init(){
  // hydrate fields
  for(const id of targetFields){
    const el = document.getElementById(id);
    if(!el) continue;
    const v = STATE.targets?.[id];
    if(v !== undefined && v !== null && v !== "") el.value = v;
  }
    if(!v || v.includes("•")){
      alert("Paste your real API key (not dots).");
      return;
    }
    null = v;
    saveState();
    alert("Saved in this browser.");
  });

  els.saveTargetsBtn.addEventListener("click", () => {
    STATE.targets = STATE.targets || {};
    for(const id of targetFields){
      const el = document.getElementById(id);
      STATE.targets[id] = el.value === "" ? "" : Number(el.value);
    }
    if(!targetsComplete()){
      alert("Please fill in ALL required micronutrient targets and water (mL) from the Health Canada calculator before continuing.");
      return;
    }
    saveState();
    alert("Targets saved.");
    renderAll();
  });

  els.clearAllBtn.addEventListener("click", () => {
    if(!confirm("Clear API key, targets, and meal plan from this browser?")) return;
    localStorage.removeItem(LS_KEY);
    location.reload();
  });

  els.searchBtn.addEventListener("click", () => doSearch());
  els.query.addEventListener("keydown", (e) => {
    if(e.key === "Enter"){ e.preventDefault(); doSearch(); }
  });

  els.exportBtn.addEventListener("click", () => {
    els.exportArea.select();
    document.execCommand("copy");
    alert("Copied. Paste into a doc if you want.");
  });

  els.printBtn.addEventListener("click", () => window.print());


  // Water tracker
  if(els.addWaterBtn){
    els.addWaterBtn.addEventListener("click", () => {
      if(!targetsComplete()){
        alert("First, save your required micronutrient targets and water (mL) in the Setup box.");
        return;
      }
      els.waterMl.value = 250;
      els.waterDlg.showModal();
    });
  }

  if(els.waterDlg){
    els.waterDlg.addEventListener("close", () => {
      if(els.waterDlg.returnValue !== "ok") return;
      const ml = Number(els.waterMl.value || 0);
      if(!ml || ml <= 0){
        alert("Enter a water amount greater than 0.");
        return;
      }
      const meal = els.meal.value;
      STATE.plan = STATE.plan || {};
      STATE.plan[meal] = STATE.plan[meal] || [];
      STATE.plan[meal].push({ type: "water", name: "Water", ml });
      saveState();
      renderAll();
    });
  }

  // dialog mode toggle
  document.querySelectorAll("input[name='amtMode']").forEach(r => {
    r.addEventListener("change", () => {
      const mode = getAmtMode();
      if(mode === "grams"){
        els.gramsBox.classList.remove("hidden");
        els.portionBox.classList.add("hidden");
      }else{
        els.gramsBox.classList.add("hidden");
        els.portionBox.classList.remove("hidden");
      }
    });
  });

  // when dialog closes with OK, add item
  els.dlg.addEventListener("close", () => {
    if(els.dlg.returnValue !== "ok" || !pendingFood) return;
    const meal = els.meal.value;
    const mode = getAmtMode();
    let grams = 0;

    if(mode === "grams"){
      grams = Number(els.grams.value || 0);
    }else{
      const idx = Number(els.portionSel.value || 0);
      const portion = pendingFood.portions?.[idx];
      const count = Number(els.portionCount.value || 0);
      grams = (portion?.gramWeight || pendingFood.gramsPerServingGuess || 0) * count;
    }

    if(!grams || grams <= 0){
      alert("Enter an amount greater than 0.");
      return;
    }

    STATE.plan = STATE.plan || {};
    STATE.plan[meal] = STATE.plan[meal] || [];
    STATE.plan[meal].push({
      fdcId: pendingFood.fdcId,
      name: pendingFood.description,
      meta: pendingFood.meta,
      grams
    });
    saveState();
    pendingFood = null;
    renderAll();
  });

  renderAll();
}

function getAmtMode(){
  const r = document.querySelector("input[name='amtMode']:checked");
  return r ? r.value : "portion";
}


function targetsComplete(){
  const t = STATE.targets || {};
  // Micronutrients + water are required for this assignment
  const required = ["t_vita","t_vitd","t_calcium","t_iron","t_zinc","t_sodium","t_water"];
  return required.every(k => t[k] !== "" && t[k] !== undefined && t[k] !== null && Number.isFinite(Number(t[k])) && Number(t[k]) > 0);
}

async function doSearch(){
  if(!FDC_API_KEY || FDC_API_KEY === "PASTE_KEY_HERE"){
    alert("Teacher setup needed: paste the USDA FoodData Central API key into app.js (FDC_API_KEY).");
    return;
  }
  if(!targetsComplete()){
    alert("First, save your required micronutrient targets and water (mL) in the Setup box.");
    return;
  }
  const q = els.query.value.trim();
  if(!q){ return; }
  els.results.innerHTML = "<p class='small'>Searching…</p>";

  try{
    const res = await fdcSearch(q);
    renderResults(res);
  }catch(err){
    console.error(err);
    els.results.innerHTML = "<p class='small'>Sorry — search failed. Check your API key and try again.</p>";
  }
}

function renderResults(data){
  const foods = data?.foods || [];
  if(!foods.length){
    els.results.innerHTML = "<p class='small'>No results. Try a different search.</p>";
    return;
  }

  els.results.innerHTML = "";
  for(const f of foods.slice(0, 10)){
    const div = document.createElement("div");
    div.className = "item";
    const metaBits = [];
    if(f.dataType) metaBits.push(f.dataType);
    if(f.brandOwner) metaBits.push(f.brandOwner);
    if(f.foodCategory) metaBits.push(f.foodCategory);
    const meta = metaBits.join(" • ");

    div.innerHTML = `
      <div class="top">
        <div>
          <div class="name">${escapeHtml(f.description || "Food")}</div>
          <div class="meta">${escapeHtml(meta)}</div>
        </div>
        <span class="pill">FDC ${f.fdcId}</span>
      </div>
      <button class="btn ghost" type="button">Add</button>
    `;
    div.querySelector("button").addEventListener("click", async () => {
      await openAmountDialog(f.fdcId, f.description, meta);
    });
    els.results.appendChild(div);
  }
}

async function openAmountDialog(fdcId, description, meta){
  els.dlgTitle.textContent = `Add: ${description}`;
  els.portionSel.innerHTML = "";
  els.portionCount.value = 1;
  els.grams.value = 100;
  // default to portions, but switch if none exist
  document.querySelector("input[name='amtMode'][value='portion']").checked = true;
  els.gramsBox.classList.add("hidden");
  els.portionBox.classList.remove("hidden");
  els.portionHint.textContent = "Loading serving options…";

  try{
    const full = await fdcFood(fdcId);
    const portions = normalizePortions(full);
    const gramsGuess = guessGramsPerServing(full);

    pendingFood = {
      fdcId,
      description,
      meta,
      portions,
      gramsPerServingGuess: gramsGuess
    };

    if(portions.length){
      portions.forEach((p, idx) => {
        const opt = document.createElement("option");
        opt.value = String(idx);
        opt.textContent = `${p.label} ≈ ${round(p.gramWeight,1)} g`;
        els.portionSel.appendChild(opt);
      });
      els.portionHint.textContent = "Choose a serving, then how many servings.";
    }else{
      // no portions: switch to grams mode
      document.querySelector("input[name='amtMode'][value='grams']").checked = true;
      els.portionBox.classList.add("hidden");
      els.gramsBox.classList.remove("hidden");
      els.portionHint.textContent = "";
    }

    // If we have a good serving guess, add a “label serving” option even when portions are empty.
    if(!portions.length && gramsGuess){
      // keep grams mode, but hint
      els.grams.value = Math.round(gramsGuess);
    }

    els.dlg.showModal();
  }catch(err){
    console.error(err);
    alert("Could not load this food. Try another result.");
  }
}

function normalizePortions(food){
  const out = [];
  // FoodData Central sometimes provides foodPortions with gramWeight.
  const fp = food?.foodPortions || [];
  for(const p of fp){
    if(!p.gramWeight) continue;
    const label = p.portionDescription || p.modifier || p.measureUnit?.name || "Serving";
    out.push({ label, gramWeight: Number(p.gramWeight) });
  }
  // Branded foods may have servingSize (often in g) even if foodPortions is missing.
  const guess = guessGramsPerServing(food);
  if(guess){
    out.unshift({ label: "Label serving", gramWeight: guess });
  }
  // Deduplicate by gramWeight+label
  return out.filter((v, i, arr) => i === arr.findIndex(x => x.label === v.label && x.gramWeight === v.gramWeight));
}

function guessGramsPerServing(food){
  const s = food?.servingSize;
  const u = (food?.servingSizeUnit || "").toLowerCase();
  if(!s) return 0;
  if(u === "g" || u === "gram" || u === "grams") return Number(s);
  if(u === "ml" || u === "milliliter" || u === "milliliters") return Number(s); // approx 1g/ml
  // If unit is "oz", convert
  if(u === "oz" || u === "ounce" || u === "ounces") return Number(s) * 28.3495;
  return 0;
}

/* Nutrition math
   We try two strategies:
   1) If labelNutrients exist (common in Branded), use those for calories/macros and some micros.
   2) Otherwise use foodNutrients (often per 100g). We treat amounts as per 100g and scale by grams.
*/
function computeTotals(planItemsByMeal, foodCache){
  const totals = makeEmptyTotals();

  const meals = Object.keys(planItemsByMeal || {});
  for(const meal of meals){
    for(const it of (planItemsByMeal[meal] || [])){
      if(it.type === "water"){
        totals.water_ml = (totals.water_ml || 0) + num(it.ml);
        continue;
      }
      const food = foodCache[it.fdcId];
      if(!food) continue;
      const grams = it.grams || 0;

      const add = computeForFood(food, grams);
      for(const [k,v] of Object.entries(add)){
        totals[k] = (totals[k] || 0) + v;
      }
    }
  }
  return totals;
}

function makeEmptyTotals(){
  return {
    kcal:0, water_ml:0,
    protein_g:0, carbs_g:0, fat_g:0,
    satfat_g:0, sugars_g:0,
    vita_ugRAE:0, vitd_ug:0, calcium_mg:0, iron_mg:0, zinc_mg:0, sodium_mg:0
  };
}

function computeForFood(food, grams){
  // Prefer labelNutrients if present (branded)
  const ln = food?.labelNutrients;
  if(ln && Object.keys(ln).length){
    // label nutrients are per serving; scale based on grams/serving guess when available.
    const gPerServ = guessGramsPerServing(food) || 0;
    const factor = gPerServ ? (grams / gPerServ) : (grams / 100); // fallback
    return {
      kcal: num(ln.calories?.value) * factor,
      protein_g: num(ln.protein?.value) * factor,
      carbs_g: num(ln.carbohydrates?.value) * factor,
      fat_g: num(ln.fat?.value) * factor,
      satfat_g: num(ln.saturatedFat?.value) * factor,
      sugars_g: num(ln.sugars?.value) * factor,
      sodium_mg: num(ln.sodium?.value) * factor
    };
  }

  // Otherwise use foodNutrients (assume per 100g)
  const map = mapNutrients(food?.foodNutrients || []);
  const factor = grams / 100;

  return {
    kcal: (map.kcal || 0) * factor,
    protein_g: (map.protein_g || 0) * factor,
    carbs_g: (map.carbs_g || 0) * factor,
    fat_g: (map.fat_g || 0) * factor,
    satfat_g: (map.satfat_g || 0) * factor,
    sugars_g: (map.sugars_g || 0) * factor,
    vita_ugRAE: (map.vita_ugRAE || 0) * factor,
    vitd_ug: (map.vitd_ug || 0) * factor,
    calcium_mg: (map.calcium_mg || 0) * factor,
    iron_mg: (map.iron_mg || 0) * factor,
    zinc_mg: (map.zinc_mg || 0) * factor,
    sodium_mg: (map.sodium_mg || 0) * factor
  };
}

function mapNutrients(foodNutrients){
  // We match by nutrient number where possible (more stable than names),
  // but fall back to name contains checks.
  const out = {};
  for(const fn of foodNutrients){
    const n = fn.nutrient || {};
    const numId = String(n.number || "");
    const name = String(n.name || "").toLowerCase();
    const unit = String(n.unitName || "").toLowerCase();
    const amt = num(fn.amount);

    // Energy
    if(numId === "208" || name.includes("energy") && unit === "kcal") out.kcal = take(out.kcal, amt);
    // Protein
    if(numId === "203" || name === "protein") out.protein_g = take(out.protein_g, amt);
    // Carbs
    if(numId === "205" || name.includes("carbohydrate")) out.carbs_g = take(out.carbs_g, amt);
    // Fat
    if(numId === "204" || name.includes("total lipid") || name === "total fat") out.fat_g = take(out.fat_g, amt);
    // Saturated fat
    if(numId === "606" || name.includes("fatty acids, total saturated")) out.satfat_g = take(out.satfat_g, amt);
    // Sugars
    if(numId === "269" || name.includes("sugars, total")) out.sugars_g = take(out.sugars_g, amt);

    // Vitamin A (RAE)
    if(numId === "320" || name.includes("vitamin a") && unit.includes("ug")) out.vita_ugRAE = take(out.vita_ugRAE, amt);
    // Vitamin D
    if(numId === "328" || name.includes("vitamin d")) out.vitd_ug = take(out.vitd_ug, amt);
    // Calcium
    if(numId === "301" || name === "calcium, ca") out.calcium_mg = take(out.calcium_mg, amt);
    // Iron
    if(numId === "303" || name === "iron, fe") out.iron_mg = take(out.iron_mg, amt);
    // Zinc
    if(numId === "309" || name === "zinc, zn") out.zinc_mg = take(out.zinc_mg, amt);
    // Sodium
    if(numId === "307" || name === "sodium, na") out.sodium_mg = take(out.sodium_mg, amt);
  }
  return out;
}

function take(existing, incoming){
  if(existing === undefined || existing === null) return incoming;
  // prefer larger (sometimes duplicates exist); but keep first if incoming is 0
  if(incoming && incoming > existing) return incoming;
  return existing;
}

function num(x){
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

function round(x, d=0){
  const m = Math.pow(10,d);
  return Math.round(x*m)/m;
}

async function ensureFoodDetailsForPlan(){
  const ids = new Set();
  for(const meal of Object.keys(STATE.plan || {})){
    for(const it of (STATE.plan[meal] || [])){
      if(it.type === "water") continue;
      ids.add(it.fdcId);
    }
  }
  STATE.cache = STATE.cache || {};
  const toFetch = [...ids].filter(id => !STATE.cache[id]);

  for(const id of toFetch){
    try{
      const full = await fdcFood(id);
      STATE.cache[id] = full;
      saveState();
    }catch(err){
      console.warn("Failed to fetch food", id, err);
    }
  }
}

function renderPlan(){
  const plan = STATE.plan || {};
  els.plan.innerHTML = "";
  const meals = ["Breakfast","Lunch","Dinner","Snacks"];
  for(const meal of meals){
    const det = document.createElement("details");
    det.open = true;
    const list = plan[meal] || [];
    const totalGrams = list.reduce((a,b)=>a+num(b.grams),0);

    det.innerHTML = `
      <summary>${meal} <span class="pill">${list.length} items</span> <span class="pill">${Math.round(totalGrams)} g</span></summary>
      <ul class="list"></ul>
    `;

    const ul = det.querySelector("ul");
    if(!list.length){
      const li = document.createElement("li");
      li.innerHTML = "<span class='small'>No foods added yet.</span>";
      ul.appendChild(li);
    }else{
      list.forEach((it, idx) => {
        const li = document.createElement("li");
        const amt = (it.type === "water")
          ? `${Math.round(it.ml)} mL`
          : `${Math.round(it.grams)} g`;
        li.innerHTML = `
          <strong>${escapeHtml(it.name)}</strong>
          <span class="small">(${amt})</span>
          <button class="btn ghost" type="button" style="padding:6px 10px;margin-left:8px;">Remove</button>
        `;
        li.querySelector("button").addEventListener("click", () => {
          plan[meal].splice(idx, 1);
          STATE.plan = plan;
          saveState();
          renderAll();
        });
        ul.appendChild(li);
      });
    }
    els.plan.appendChild(det);
  }
}

function renderCheck(){
  const targets = STATE.targets || {};
  const cache = STATE.cache || {};
  const totals = computeTotals(STATE.plan || {}, cache);

  // Build rows: nutrient, intake, target, UL/Limit, status
  const rows = [];

  // helpers to compute % energy caps
  const kcal = totals.kcal || 0;
  const pct = (xKcal) => kcal ? (xKcal / kcal) * 100 : 0;
  const satFatKcal = totals.satfat_g * 9;
  const sugarKcal = totals.sugars_g * 4;

  const limits = DEFAULT_LIMITS;

  rows.push(makeRow("Energy", totals.kcal, "kcal", targets.t_cal, null, null, "target"));
  rows.push(makeRow("Water", totals.water_ml, "mL", targets.t_water, null, null, "target"));
  rows.push(makeRow("Protein", totals.protein_g, "g", targets.t_protein, null, null, "target"));
  rows.push(makeRow("Carbs", totals.carbs_g, "g", targets.t_carbs, null, null, "target"));
  rows.push(makeRow("Total fat", totals.fat_g, "g", targets.t_fat, null, null, "target"));

  // Macro limits (not ULs)
  rows.push(makeRow("Saturated fat (Limit)", pct(satFatKcal), "% of energy", null, limits.limits.satFat_pctEnergy, "Limit", "limit"));
  rows.push(makeRow("Total sugars (Limit)", pct(sugarKcal), "% of energy", null, limits.limits.addedSugar_pctEnergy, "Limit", "limit"));

  // Micronutrients targets + ULs
  rows.push(makeRow("Vitamin A", totals.vita_ugRAE, "µg RAE", targets.t_vita, limits.ul.vitA_ugRAE, "UL", "ul"));
  rows.push(makeRow("Vitamin D", totals.vitd_ug, "µg", targets.t_vitd, limits.ul.vitD_ug, "UL", "ul"));
  rows.push(makeRow("Calcium", totals.calcium_mg, "mg", targets.t_calcium, limits.ul.calcium_mg, "UL", "ul"));
  rows.push(makeRow("Iron", totals.iron_mg, "mg", targets.t_iron, limits.ul.iron_mg, "UL", "ul"));
  rows.push(makeRow("Zinc", totals.zinc_mg, "mg", targets.t_zinc, limits.ul.zinc_mg, "UL", "ul"));
  rows.push(makeRow("Sodium (Cap)", totals.sodium_mg, "mg", targets.t_sodium, limits.ul.sodium_mg, "Cap", "ul"));

  // render table-like rows
  els.check.innerHTML = "";
  const head = document.createElement("div");
  head.className = "rowline head";
  head.innerHTML = "<div>Nutrient</div><div>Intake</div><div>Target</div><div>UL/Limit</div><div>Status</div>";
  els.check.appendChild(head);

  for(const r of rows){
    const div = document.createElement("div");
    div.className = "rowline";
    div.innerHTML = `
      <div>${escapeHtml(r.name)}</div>
      <div>${fmt(r.intake, r.unit)}</div>
      <div>${r.target === null || r.target === "" ? "<span class='small'>—</span>" : fmt(r.target, r.unitTarget || r.unit)}</div>
      <div>${r.cap === null || r.cap === "" ? "<span class='small'>—</span>" : fmt(r.cap, r.unitCap || r.unit)} <span class="small">${r.capLabel ? "(" + r.capLabel + ")" : ""}</span></div>
      <div><span class="badge ${r.statusClass}">${r.statusText}</span></div>
    `;
    els.check.appendChild(div);
  }

  // export summary text
  els.exportArea.value = buildPrintableSummary(totals, rows);
}

function makeRow(name, intake, unit, target, cap, capLabel, kind){
  // Status rules:
  // - If cap exists: warn at 80–99%, bad at 100%+
  // - If target exists: ok if >= target*0.9, warn if 70–89%, else warn (under)
  // For energy/macros: we focus on meeting target; for limit/UL: we focus on not exceeding.
  let statusClass = "ok";
  let statusText = "OK";

  const hasCap = cap !== null && cap !== undefined && cap !== "";
  const hasTarget = target !== null && target !== undefined && target !== "";

  if(hasCap){
    const ratio = cap ? (intake / cap) : 0;
    if(ratio >= 1){
      statusClass = "bad"; statusText = "Over";
    }else if(ratio >= 0.8){
      statusClass = "warn"; statusText = "Close";
    }else{
      statusClass = "ok"; statusText = "Safe";
    }
  }

  if(kind === "target" && hasTarget){
    const ratio = target ? (intake / target) : 0;
    if(ratio >= 0.9){
      statusClass = "ok"; statusText = "Meets";
    }else if(ratio >= 0.7){
      statusClass = "warn"; statusText = "Close";
    }else{
      statusClass = "warn"; statusText = "Low";
    }
  }

  // For rows that have BOTH target + cap (micros), cap safety takes priority if exceeded.
  if(hasCap && intake >= cap){
    statusClass = "bad"; statusText = "Over";
  }

  return { name, intake, unit, target, cap, capLabel, statusClass, statusText };
}

function fmt(val, unit){
  const v = Number(val);
  if(!Number.isFinite(v)) return "—";
  const d = (unit.includes("%") || unit === "kcal") ? 0 : 1;
  return `${round(v, d)} ${unit}`;
}

function buildPrintableSummary(totals, rows){
  const lines = [];
  lines.push("GRADE 4 – 1‑DAY MEAL PLAN SUMMARY");
  lines.push("");
  lines.push("TOTALS");
  lines.push(`Energy: ${round(totals.kcal,0)} kcal`);
  lines.push(`Protein: ${round(totals.protein_g,1)} g`);
  lines.push(`Carbs: ${round(totals.carbs_g,1)} g`);
  lines.push(`Total fat: ${round(totals.fat_g,1)} g`);
  lines.push("");
  lines.push("SAFETY & TARGET CHECK");
  for(const r of rows){
    lines.push(`${r.name}: ${fmt(r.intake, r.unit)} | Status: ${r.statusText}`);
  }
  lines.push("");
  lines.push("REFLECTION (answer in sentences)");
  lines.push("1) What was ONE nutrient that was hard to balance? Why?");
  lines.push("2) If something was over a limit, what food change could fix it?");
  lines.push("3) Name one healthy choice you are proud of in your plan.");
  return lines.join("\n");
}

async function renderAll(){
  renderPlan();

  // Load food details (if any items)
  await ensureFoodDetailsForPlan();

  renderCheck();
}

/* FoodData Central API calls */
async function fdcSearch(query){
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(FDC_API_KEY)}`;
  const body = {
    query,
    pageSize: 25,
    pageNumber: 1,
    // include both branded and non-branded
    dataType: ["Foundation","SR Legacy","Survey (FNDDS)","Branded"]
  };
  const r = await fetch(url, {
    method:"POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(body)
  });
  if(!r.ok) throw new Error("Search failed: " + r.status);
  return await r.json();
}

async function fdcFood(fdcId){
  const url = `https://api.nal.usda.gov/fdc/v1/food/${encodeURIComponent(fdcId)}?api_key=${encodeURIComponent(FDC_API_KEY)}`;
  const r = await fetch(url);
  if(!r.ok) throw new Error("Food fetch failed: " + r.status);
  return await r.json();
}

/* Local storage */
function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {      targets: parsed.targets || {},
      plan: parsed.plan || {},
      cache: parsed.cache || {} // food details by fdcId
    };
  }catch{
    return { targets:{}, plan:{}, cache:{} };
  }
}
function saveState(){
  localStorage.setItem(LS_KEY, JSON.stringify({    targets: STATE.targets || {},
    plan: STATE.plan || {},
    cache: STATE.cache || {}
  }));
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
