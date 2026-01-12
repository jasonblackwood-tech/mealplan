# Grade 4 Meal Plan Checker (No ads, no trackers)

This is a tiny, student-friendly web app that:
- lets students build a 1-day meal plan (Breakfast/Lunch/Dinner/Snacks)
- searches foods using USDA FoodData Central (FDC)
- totals nutrients and checks:
  - “Targets” (students type results from Health Canada’s DRI Calculator)
  - “Safety caps” (UL / everyday caps)
  - “Macro limits” (saturated fat and sugars shown as % of energy)

## What it stores
Nothing on a server. It stores targets and the meal plan **only in the browser’s localStorage**

## Files
- `index.html`
- `styles.css`
- `app.js`

## Host + embed in Google Sites (simple)
1) Upload these files to any static host:
   - GitHub Pages (recommended)
   - Cloudflare Pages
   - Firebase Hosting

2) In Google Sites: **Insert → Embed → URL** and paste the hosted page URL.

## Notes for accuracy (important)
FoodData Central foods vary:
- Many non-branded foods provide nutrients per 100 g.
- Many branded foods provide label nutrients per serving.
This app uses label nutrients when available; otherwise it scales per 100 g.

## Attribution
- USDA FoodData Central data are CC0/public domain; please cite FoodData Central.
- Health Canada DRI targets should be sourced by students from:
  https://health-infobase.canada.ca/nutrition/dietary-reference-intakes-calculator/

## Teacher setup (API key)
Obtain your API key from https://fdc.nal.usda.gov/api-key-signup
