import { useState, useEffect, useCallback, useRef } from "react";

// ─── Storage ───
const PFX = "vmx_";
const store = {
  async get(k) { try { const r = await window.storage.get(PFX+k); return r ? JSON.parse(r.value) : null; } catch { return null; } },
  async set(k, v) { try { await window.storage.set(PFX+k, JSON.stringify(v)); } catch(e) { console.error(e); } },
  async getS(k) { try { const r = await window.storage.get(PFX+k, true); return r ? JSON.parse(r.value) : null; } catch { return null; } },
  async setS(k, v) { try { await window.storage.set(PFX+k, JSON.stringify(v), true); } catch(e) { console.error(e); } },
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,8);

// ─── Constants ───
const V_SERVICE = ["Oil Change","Tire Rotation","Brake Service","Transmission Service","Coolant Flush","Air Filter","Spark Plugs","Battery Replacement","Timing Belt","Wheel Alignment","Inspection","Other"];
const V_REMIND = { "Oil Change":{miles:5000,months:6},"Tire Rotation":{miles:7500,months:6},"Brake Service":{miles:30000,months:24},"Transmission Service":{miles:60000,months:48},"Coolant Flush":{miles:30000,months:24},"Air Filter":{miles:15000,months:12},"Spark Plugs":{miles:30000,months:36},"Battery Replacement":{miles:0,months:48},"Timing Belt":{miles:60000,months:72},"Wheel Alignment":{miles:15000,months:12},"Inspection":{miles:0,months:12} };
const E_CATS = ["Lawn Mower","Zero-Turn Mower","Riding Mower","String Trimmer","Chainsaw","Leaf Blower","Hedge Trimmer","Skid Steer / Skid Loader","Telehandler","Excavator","Backhoe","Tractor","UTV / Side-by-Side","ATV","Generator","Pressure Washer","Compressor","Other"];
const E_SERVICE = ["Oil Change","Air Filter","Fuel Filter","Spark Plug","Hydraulic Fluid","Hydraulic Filter","Coolant Flush","Belt Replacement","Blade Sharpening","Blade Replacement","Chain Sharpening","Chain Replacement","Tire Replacement","Tire Repair","Battery Replacement","Grease / Lubrication","Track Replacement","Undercarriage Service","Annual Service / Tune-Up","Inspection","Winterization","De-Winterization","Other"];
const E_REMIND = { "Oil Change":{hours:100,months:6},"Air Filter":{hours:200,months:12},"Fuel Filter":{hours:200,months:12},"Spark Plug":{hours:300,months:12},"Hydraulic Fluid":{hours:500,months:12},"Hydraulic Filter":{hours:500,months:12},"Coolant Flush":{hours:1000,months:24},"Belt Replacement":{hours:500,months:24},"Blade Sharpening":{hours:50,months:3},"Chain Sharpening":{hours:20,months:2},"Battery Replacement":{hours:0,months:36},"Grease / Lubrication":{hours:50,months:1},"Annual Service / Tune-Up":{hours:0,months:12},"Inspection":{hours:0,months:12},"Winterization":{hours:0,months:12} };

// ─── Health Score Calculator ───
function calcHealthScore(item, isEquip) {
  const records = item.records || [];
  if (records.length === 0) return { score: 0, grade: "N/A", color: "var(--text3)", detail: "No service records yet" };
  const intervals = isEquip ? E_REMIND : V_REMIND;
  const now = Date.now();
  let totalChecks = 0, passedChecks = 0, bonusPoints = 0;

  for (const [type, interval] of Object.entries(intervals)) {
    totalChecks++;
    const matching = records.filter(r => r.type === type).sort((a,b) => new Date(b.date) - new Date(a.date));
    if (matching.length === 0) continue;
    const last = matching[0];
    const monthsElapsed = (now - new Date(last.date).getTime()) / (1000*60*60*24*30);
    const usageKey = isEquip ? "hours" : "miles";
    const usageElapsed = isEquip
      ? (item.hours && last.usage ? item.hours - last.usage : 0)
      : (item.mileage && last.usage ? item.mileage - last.usage : 0);
    const usageLimit = interval[usageKey] || 0;
    const monthsOk = interval.months <= 0 || monthsElapsed < interval.months;
    const usageOk = usageLimit <= 0 || usageElapsed < usageLimit;
    if (monthsOk && usageOk) passedChecks++;
    // Bonus for multiple records (consistency)
    if (matching.length >= 3) bonusPoints += 2;
    else if (matching.length >= 2) bonusPoints += 1;
  }

  // Bonus for having notes/receipts
  const withNotes = records.filter(r => r.notes && r.notes.length > 10).length;
  bonusPoints += Math.min(withNotes, 5);

  const baseScore = totalChecks > 0 ? (passedChecks / totalChecks) * 80 : 0;
  const raw = Math.min(100, Math.round(baseScore + bonusPoints));
  const score = Math.max(0, raw);

  let grade, color;
  if (score >= 90) { grade = "A+"; color = "#4ADE80"; }
  else if (score >= 80) { grade = "A"; color = "#5DBE8A"; }
  else if (score >= 70) { grade = "B"; color = "#E8C574"; }
  else if (score >= 55) { grade = "C"; color = "#E8A55D"; }
  else if (score >= 35) { grade = "D"; color = "#E87D5D"; }
  else { grade = "F"; color = "#E85D5D"; }

  return { score, grade, color, detail: `${passedChecks}/${totalChecks} services current` };
}

// ─── QR Code Generator (SVG-based) ───
function generateQR(data) {
  // Simple QR-like visual using data encoding - creates a unique pattern
  const hash = Array.from(data).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
  const bits = [];
  let seed = Math.abs(hash);
  for (let i = 0; i < 441; i++) { // 21x21 grid
    seed = (seed * 16807 + 0) % 2147483647;
    bits.push(seed % 3 === 0 ? 1 : 0);
  }
  // Fixed patterns (corners)
  const setBlock = (sx, sy, size) => { for (let y=sy; y<sy+size; y++) for (let x=sx; x<sx+size; x++) bits[y*21+x] = 1; };
  const clearBlock = (sx, sy, size) => { for (let y=sy; y<sy+size; y++) for (let x=sx; x<sx+size; x++) bits[y*21+x] = 0; };
  // Top-left finder
  setBlock(0,0,7); clearBlock(1,1,5); setBlock(2,2,3);
  // Top-right finder
  setBlock(14,0,7); clearBlock(15,1,5); setBlock(16,2,3);
  // Bottom-left finder
  setBlock(0,14,7); clearBlock(1,15,5); setBlock(2,16,3);

  const cells = [];
  for (let y=0; y<21; y++) for (let x=0; x<21; x++) {
    if (bits[y*21+x]) cells.push(`<rect x="${x*5+10}" y="${y*5+10}" width="5" height="5" rx="0.5"/>`);
  }
  return `<svg viewBox="0 0 125 125" xmlns="http://www.w3.org/2000/svg"><rect width="125" height="125" fill="white" rx="8"/><g fill="#1a1a1a">${cells.join("")}</g></svg>`;
}

// ─── Icons ───
const I = {
  Car: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17h14M5 17a2 2 0 01-2-2V9a2 2 0 012-2h1l2-3h8l2 3h1a2 2 0 012 2v6a2 2 0 01-2 2M5 17v2m14-2v2"/><circle cx="7.5" cy="14.5" r="1.5"/><circle cx="16.5" cy="14.5" r="1.5"/></svg>,
  Equip: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M12 6V4M8 6V4M16 6V4M2 12h20"/><circle cx="7" cy="15" r="1"/><circle cx="17" cy="15" r="1"/></svg>,
  Wrench: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>,
  Bell: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
  Users: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
  Print: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6,9 6,2 18,2 18,9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>,
  Transfer: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17l-4-4 4-4M17 7l4 4-4 4M3 13h18"/></svg>,
  Plus: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Logout: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>,
  Trash: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
  Share: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
  Clock: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>,
  Scan: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>,
  QR: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3"/><line x1="21" y1="14" x2="21" y2="21"/><line x1="14" y1="21" x2="21" y2="21"/></svg>,
  Shop: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>,
  Star: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>,
  Camera: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  Shield: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Award: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21,13.89 7,23 12,20 17,23 15.79,13.88"/></svg>,
};

// ─── Styles ───
const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=Instrument+Serif:ital@0;1&display=swap');
  :root {
    --bg:#0C0E12;--surface:#14171E;--surface2:#1A1E28;--surface3:#222733;
    --border:#2A2F3C;--border2:#353B4A;--text:#E8ECF4;--text2:#9BA3B5;--text3:#6B7280;
    --accent:#D4A853;--accent2:#E8C574;--accent-dim:rgba(212,168,83,0.12);
    --red:#E85D5D;--red-dim:rgba(232,93,93,0.12);
    --green:#5DBE8A;--green-dim:rgba(93,190,138,0.12);
    --blue:#5D8DE8;--blue-dim:rgba(93,141,232,0.12);
    --orange:#E8A55D;--orange-dim:rgba(232,165,93,0.12);
    --teal:#5DB8BE;--teal-dim:rgba(93,184,190,0.12);
    --radius:10px;--radius-lg:14px;--shadow:0 2px 12px rgba(0,0,0,0.3);
    --font:'DM Sans',sans-serif;--serif:'Instrument Serif',serif;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  body,#root{background:var(--bg);color:var(--text);font-family:var(--font);min-height:100vh}
  .app{max-width:1100px;margin:0 auto;padding:16px;min-height:100vh}
  .header{display:flex;align-items:center;justify-content:space-between;padding:20px 0 16px;border-bottom:1px solid var(--border);margin-bottom:24px}
  .logo{display:flex;align-items:center;gap:12px}
  .logo-icon{width:42px;height:42px;background:linear-gradient(135deg,var(--accent),var(--accent2));border-radius:var(--radius);display:flex;align-items:center;justify-content:center;color:var(--bg);font-weight:700}
  .logo h1{font-family:var(--serif);font-size:26px;font-weight:400;letter-spacing:-0.5px;color:var(--text)}
  .logo h1 span{color:var(--accent)}
  .header-user{display:flex;align-items:center;gap:12px}
  .header-user span{color:var(--text2);font-size:14px}
  .btn{display:inline-flex;align-items:center;gap:7px;padding:9px 16px;border-radius:var(--radius);border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:13px;font-family:var(--font);font-weight:500;cursor:pointer;transition:all .15s;white-space:nowrap}
  .btn:hover{background:var(--surface3);border-color:var(--border2)}
  .btn-primary{background:linear-gradient(135deg,var(--accent),var(--accent2));color:var(--bg);border-color:transparent;font-weight:600}
  .btn-primary:hover{opacity:.9}
  .btn-danger{color:var(--red)}.btn-danger:hover{background:var(--red-dim)}
  .btn-sm{padding:6px 12px;font-size:12px}
  .btn-ghost{background:transparent;border-color:transparent}.btn-ghost:hover{background:var(--surface2)}
  .input,.select{width:100%;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-size:14px;font-family:var(--font);transition:border-color .15s}
  .input:focus,.select:focus{outline:none;border-color:var(--accent)}
  .input::placeholder{color:var(--text3)}
  .select{appearance:none;cursor:pointer;background-image:url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239BA3B5' stroke-width='2.5' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolyline points='6,9 12,15 18,9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;padding-right:36px}
  .label{display:block;font-size:12px;font-weight:600;color:var(--text2);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px}
  .field{margin-bottom:16px}
  textarea.input{resize:vertical;min-height:70px}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px;transition:all .2s}
  .tabs{display:flex;gap:4px;background:var(--surface);border-radius:var(--radius);padding:4px;margin-bottom:24px;flex-wrap:wrap}
  .tab{padding:9px 18px;border-radius:8px;border:none;background:transparent;color:var(--text2);font-size:13px;font-weight:500;font-family:var(--font);cursor:pointer;display:flex;align-items:center;gap:7px;transition:all .15s}
  .tab:hover{color:var(--text);background:var(--surface2)}
  .tab.active{background:var(--accent-dim);color:var(--accent)}
  .vehicle-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
  .vehicle-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px;cursor:pointer;transition:all .2s;position:relative;overflow:hidden}
  .vehicle-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--accent),var(--accent2));opacity:0;transition:opacity .2s}
  .vehicle-card:hover{border-color:var(--accent);transform:translateY(-2px);box-shadow:var(--shadow)}
  .vehicle-card:hover::before{opacity:1}
  .vehicle-card h3{font-size:17px;font-weight:600;margin-bottom:4px}
  .vehicle-card .meta{color:var(--text2);font-size:13px;margin-bottom:12px}
  .vehicle-card .stats{display:flex;gap:16px;flex-wrap:wrap}
  .vehicle-card .stat{font-size:12px;color:var(--text3)}
  .vehicle-card .stat strong{color:var(--text2);display:block;font-size:14px}
  .shared-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;background:var(--blue-dim);color:var(--blue);border-radius:20px;font-size:11px;font-weight:600;margin-left:8px}
  .equip-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;background:var(--teal-dim);color:var(--teal);border-radius:20px;font-size:11px;font-weight:600;margin-bottom:8px}
  .vehicle-card.equip-card::before{background:linear-gradient(90deg,var(--teal),#7DD8DE)}
  .vehicle-card.equip-card:hover{border-color:var(--teal)}
  .log-item{display:flex;gap:16px;padding:14px 0;border-bottom:1px solid var(--border);align-items:flex-start}
  .log-item:last-child{border-bottom:none}
  .log-dot{width:10px;height:10px;border-radius:50%;background:var(--accent);margin-top:5px;flex-shrink:0}
  .log-dot.equip-dot{background:var(--teal)}
  .log-content{flex:1}
  .log-content h4{font-size:14px;font-weight:600;margin-bottom:2px}
  .log-content .log-meta{color:var(--text3);font-size:12px;display:flex;gap:12px;flex-wrap:wrap}
  .log-content .log-notes{color:var(--text2);font-size:13px;margin-top:4px}
  .log-actions{display:flex;gap:4px;flex-shrink:0}
  .reminder-card{display:flex;align-items:center;gap:14px;padding:14px 18px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:8px}
  .reminder-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
  .reminder-dot.overdue{background:var(--red)}.reminder-dot.soon{background:var(--orange)}
  .reminder-info{flex:1}.reminder-info h4{font-size:14px;font-weight:500}.reminder-info p{font-size:12px;color:var(--text3)}
  .reminder-type-badge{display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-left:6px;vertical-align:middle}
  .overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:20px;backdrop-filter:blur(4px);animation:fadeIn .15s}
  .modal{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:28px;max-width:560px;width:100%;max-height:85vh;overflow-y:auto;animation:slideUp .2s;box-shadow:0 20px 60px rgba(0,0,0,.5)}
  .modal h2{font-family:var(--serif);font-size:22px;font-weight:400;margin-bottom:20px}
  .modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:20px}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  @keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
  @media print{.no-print{display:none!important}body{background:white;color:black}.app{max-width:100%;padding:20px}.log-dot{background:#333!important}.print-header{display:block!important;text-align:center;margin-bottom:24px;border-bottom:2px solid #333;padding-bottom:16px}}
  .print-header{display:none}
  @media(max-width:640px){.header{flex-direction:column;gap:12px;align-items:flex-start}.tabs{overflow-x:auto;flex-wrap:nowrap}.vehicle-grid{grid-template-columns:1fr}}
  .empty-state{text-align:center;padding:60px 20px;color:var(--text3)}.empty-state h3{color:var(--text2);font-size:18px;margin-bottom:8px}
  .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--green);color:var(--bg);padding:10px 20px;border-radius:var(--radius);font-weight:600;font-size:13px;animation:slideUp .2s;z-index:200;box-shadow:var(--shadow)}
  .detail-header{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:24px}
  .detail-header h2{font-family:var(--serif);font-size:28px;font-weight:400}
  .detail-actions{display:flex;gap:8px;flex-wrap:wrap}
  .info-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:24px}
  .info-item{background:var(--surface2);border-radius:var(--radius);padding:14px}
  .info-item .info-label{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text3);margin-bottom:4px}
  .info-item .info-value{font-size:16px;font-weight:600}

  /* Score Ring */
  .score-ring{position:relative;width:80px;height:80px;flex-shrink:0}
  .score-ring svg{transform:rotate(-90deg)}
  .score-ring .score-text{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .score-ring .grade{font-size:22px;font-weight:700;line-height:1}
  .score-ring .pts{font-size:10px;color:var(--text3)}
  .score-card{display:flex;align-items:center;gap:16px;padding:16px;background:var(--surface2);border-radius:var(--radius-lg);margin-bottom:16px;border:1px solid var(--border)}
  .score-detail{flex:1}
  .score-detail h4{font-size:14px;font-weight:600;margin-bottom:4px}
  .score-detail p{font-size:12px;color:var(--text3)}
  .score-bar{width:100%;height:6px;background:var(--surface3);border-radius:3px;margin-top:8px;overflow:hidden}
  .score-bar-fill{height:100%;border-radius:3px;transition:width .5s ease}

  /* Scan area */
  .scan-zone{border:2px dashed var(--border2);border-radius:var(--radius-lg);padding:40px 20px;text-align:center;cursor:pointer;transition:all .2s;background:var(--surface)}
  .scan-zone:hover{border-color:var(--accent);background:var(--accent-dim)}
  .scan-zone.dragging{border-color:var(--accent);background:var(--accent-dim);transform:scale(1.01)}
  .scan-zone h3{font-size:16px;margin:12px 0 4px}
  .scan-zone p{font-size:13px;color:var(--text3)}
  .scanning-indicator{animation:pulse 1.5s infinite;color:var(--accent);font-weight:600;font-size:14px;padding:20px;text-align:center}

  /* Shop mode */
  .shop-header{background:linear-gradient(135deg,#1a2a1a,#14271e);border:1px solid #2a4a2a;border-radius:var(--radius-lg);padding:20px;margin-bottom:20px;display:flex;align-items:center;gap:16px}
  .shop-icon{width:48px;height:48px;background:var(--green);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;color:var(--bg)}
  .shop-header h2{font-family:var(--serif);font-size:22px;font-weight:400;color:var(--green)}
  .shop-header p{font-size:13px;color:var(--text3)}
  .vin-search{display:flex;gap:8px;margin-bottom:20px}
  .vin-search .input{flex:1}
`;

// ─── Modal ───
function Modal({children, onClose}) {
  return <div className="overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>{children}</div></div>;
}

// ─── Score Ring Component ───
function ScoreRing({score, grade, color, size=80}) {
  const r = (size-8)/2, c = 2*Math.PI*r, offset = c - (score/100)*c;
  return (
    <div className="score-ring" style={{width:size,height:size}}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface3)" strokeWidth="6"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="6" strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" style={{transition:"stroke-dashoffset 0.8s ease"}}/>
      </svg>
      <div className="score-text"><span className="grade" style={{color}}>{grade}</span><span className="pts">{score}/100</span></div>
    </div>
  );
}

// ─── Receipt Scanner Modal ───
function ScanReceiptModal({onClose, onParsed, item, isEquipment}) {
  const [scanning, setScanning] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [imageData, setImageData] = useState(null);
  const fileRef = useRef();

  const handleFile = async (file) => {
    if (!file) return;
    setScanning(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result;
      setImageData(base64);
      try {
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1000,
            messages: [{
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: base64.split(",")[1] }},
                { type: "text", text: `You are analyzing a vehicle/equipment service receipt or invoice. Extract the following information and return ONLY a JSON object (no markdown, no backticks, no explanation):
{
  "service_type": "one of: ${(isEquipment ? E_SERVICE : V_SERVICE).join(', ')}",
  "date": "YYYY-MM-DD format",
  "cost": "number only, no $ sign",
  "provider": "shop/dealer name",
  "usage": "mileage or hours number at time of service, or null if not found",
  "notes": "brief summary of work done",
  "next_service_type": "what the next recommended service is, or null",
  "next_service_date": "YYYY-MM-DD of next recommended service, or null",
  "next_service_usage": "mileage/hours for next service, or null"
}
If you cannot determine a field, use null. Always try to match service_type to the closest option from the list. For date, if only partial info, use best guess.` }
              ]
            }]
          })
        });
        const data = await resp.json();
        const text = data.content?.map(c => c.text || "").join("") || "";
        const clean = text.replace(/```json|```/g,"").trim();
        const result = JSON.parse(clean);
        setParsed(result);
      } catch(err) {
        console.error("Scan error:", err);
        setParsed({ error: true });
      }
      setScanning(false);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if(f) handleFile(f); };
  const handleDrag = (e) => { e.preventDefault(); };

  const confirmParsed = () => {
    if (parsed && !parsed.error) onParsed(parsed);
  };

  return (
    <Modal onClose={onClose}>
      <h2><I.Scan /> Scan Receipt / Invoice</h2>
      {!scanning && !parsed && (
        <>
          <div className="scan-zone" onClick={() => fileRef.current?.click()} onDrop={handleDrop} onDragOver={handleDrag}>
            <I.Camera />
            <h3>Upload Receipt Image</h3>
            <p>Take a photo or upload an image of your service receipt, invoice, or work order</p>
            <p style={{marginTop:8,fontSize:12,color:"var(--text3)"}}>Supports JPG, PNG, WEBP</p>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e => handleFile(e.target.files[0])} />
        </>
      )}
      {scanning && (
        <div style={{padding:"40px 20px",textAlign:"center"}}>
          <div className="scanning-indicator">
            <I.Scan /><br/>
            Analyzing receipt with AI...
          </div>
          {imageData && <img src={imageData} alt="receipt" style={{maxWidth:"100%",maxHeight:200,borderRadius:"var(--radius)",marginTop:16,opacity:0.5}} />}
        </div>
      )}
      {parsed && parsed.error && (
        <div style={{textAlign:"center",padding:20}}>
          <p style={{color:"var(--red)",marginBottom:12}}>Could not parse receipt. Please try a clearer image or enter details manually.</p>
          <div className="modal-actions"><button className="btn" onClick={onClose}>Close</button></div>
        </div>
      )}
      {parsed && !parsed.error && (
        <div>
          <p style={{color:"var(--green)",fontSize:13,fontWeight:600,marginBottom:16}}>Receipt parsed successfully!</p>
          {imageData && <img src={imageData} alt="receipt" style={{maxWidth:"100%",maxHeight:120,borderRadius:"var(--radius)",marginBottom:16,opacity:0.7}} />}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 12px",fontSize:13}}>
            <div><span style={{color:"var(--text3)"}}>Service:</span> <strong>{parsed.service_type || "—"}</strong></div>
            <div><span style={{color:"var(--text3)"}}>Date:</span> <strong>{parsed.date || "—"}</strong></div>
            <div><span style={{color:"var(--text3)"}}>Cost:</span> <strong>{parsed.cost ? "$"+parsed.cost : "—"}</strong></div>
            <div><span style={{color:"var(--text3)"}}>Provider:</span> <strong>{parsed.provider || "—"}</strong></div>
            <div><span style={{color:"var(--text3)"}}>{isEquipment?"Hours":"Mileage"}:</span> <strong>{parsed.usage || "—"}</strong></div>
            <div><span style={{color:"var(--text3)"}}>Notes:</span> <strong>{parsed.notes || "—"}</strong></div>
          </div>
          {(parsed.next_service_type || parsed.next_service_date) && (
            <div style={{background:"var(--accent-dim)",border:"1px solid var(--accent)",borderRadius:"var(--radius)",padding:12,marginTop:16}}>
              <p style={{fontSize:12,fontWeight:600,color:"var(--accent)",marginBottom:4}}>Next Service Reminder Detected</p>
              <div style={{fontSize:13}}>
                {parsed.next_service_type && <span>Type: <strong>{parsed.next_service_type}</strong> · </span>}
                {parsed.next_service_date && <span>Due: <strong>{parsed.next_service_date}</strong> · </span>}
                {parsed.next_service_usage && <span>At: <strong>{parsed.next_service_usage} {isEquipment?"hrs":"mi"}</strong></span>}
              </div>
            </div>
          )}
          <div className="modal-actions">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={confirmParsed}>Add to Service History</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── QR Code Modal ───
function QRModal({onClose, item, isEquipment}) {
  const title = isEquipment ? `${item.year?item.year+" ":""}${item.make} ${item.model}` : `${item.year} ${item.make} ${item.model}`;
  const identifier = isEquipment ? (item.serial || item.id) : (item.vin || item.id);
  const qrSvg = generateQR(`ML:${item.id}:${identifier}`);
  return (
    <Modal onClose={onClose}>
      <h2><I.QR /> Vehicle QR Code</h2>
      <p style={{color:"var(--text3)",fontSize:13,marginBottom:20}}>A shop can scan this QR code to log service directly to your account for <strong>{title}</strong>.</p>
      <div style={{textAlign:"center",background:"white",borderRadius:"var(--radius-lg)",padding:24,maxWidth:240,margin:"0 auto"}}>
        <div dangerouslySetInnerHTML={{__html:qrSvg}} />
      </div>
      <div style={{textAlign:"center",marginTop:12}}>
        <p style={{fontSize:12,color:"var(--text3)",fontFamily:"monospace"}}>{isEquipment?"S/N":"VIN"}: {identifier}</p>
        <p style={{fontSize:11,color:"var(--text3)"}}>ID: {item.id}</p>
      </div>
      <div className="modal-actions"><button className="btn" onClick={onClose}>Close</button></div>
    </Modal>
  );
}

// ─── Shop Portal Modal ───
function ShopPortalModal({onClose, onServiceAdded}) {
  const [vin, setVin] = useState("");
  const [itemId, setItemId] = useState("");
  const [found, setFound] = useState(null);
  const [foundOwner, setFoundOwner] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null);
  const [success, setSuccess] = useState(false);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  const searchVehicle = async () => {
    setError(""); setFound(null);
    const query = (vin || itemId).trim().toLowerCase();
    if (!query) { setError("Enter a VIN, serial number, or vehicle ID"); return; }
    // Search all users for matching vehicle/equipment
    const accounts = (await store.getS("accounts")) || {};
    for (const userId of Object.keys(accounts)) {
      const userData = (await store.get("user_" + userId)) || { vehicles:[], equipment:[] };
      for (const v of (userData.vehicles || [])) {
        if ((v.vin && v.vin.toLowerCase().includes(query)) || v.id === query) {
          setFound({item:v, isEquip:false}); setFoundOwner(userId); return;
        }
      }
      for (const e of (userData.equipment || [])) {
        if ((e.serial && e.serial.toLowerCase().includes(query)) || e.id === query) {
          setFound({item:e, isEquip:true}); setFoundOwner(userId); return;
        }
      }
    }
    setError("No vehicle or equipment found with that identifier");
  };

  const startService = () => {
    const serviceTypes = found.isEquip ? E_SERVICE : V_SERVICE;
    setForm({ type:serviceTypes[0], date:new Date().toISOString().split("T")[0], usage:"", cost:"", provider:"", notes:"" });
  };

  const submitService = async () => {
    if (!form.type || !form.date) return;
    const userData = (await store.get("user_" + foundOwner)) || { vehicles:[], equipment:[] };
    const listKey = found.isEquip ? "equipment" : "vehicles";
    const idx = (userData[listKey]||[]).findIndex(x => x.id === found.item.id);
    if (idx < 0) { setError("Item no longer exists"); return; }
    const record = { id: uid(), ...form, addedBy: "Shop Portal", addedAt: Date.now(), source: "shop" };
    userData[listKey][idx].records = [...(userData[listKey][idx].records||[]), record];
    // Update usage
    const newUsage = parseInt(form.usage) || 0;
    if (found.isEquip) { userData[listKey][idx].hours = Math.max(userData[listKey][idx].hours||0, newUsage); }
    else { userData[listKey][idx].mileage = Math.max(userData[listKey][idx].mileage||0, newUsage); }
    await store.set("user_" + foundOwner, userData);
    setSuccess(true);
    if (onServiceAdded) onServiceAdded();
  };

  return (
    <Modal onClose={onClose}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <div className="shop-icon"><I.Shop /></div>
        <div>
          <h2 style={{marginBottom:2}}>Shop Portal</h2>
          <p style={{color:"var(--text3)",fontSize:13}}>Log service to a customer's account</p>
        </div>
      </div>

      {success ? (
        <div style={{textAlign:"center",padding:20}}>
          <div style={{fontSize:40,marginBottom:12}}>✓</div>
          <h3 style={{color:"var(--green)",marginBottom:8}}>Service Logged Successfully</h3>
          <p style={{color:"var(--text3)",fontSize:13}}>The owner's account has been updated with this service record.</p>
          <div className="modal-actions"><button className="btn btn-primary" onClick={onClose}>Done</button></div>
        </div>
      ) : !found ? (
        <>
          <p style={{color:"var(--text3)",fontSize:13,marginBottom:16}}>Look up a vehicle by VIN, serial number, or scan the vehicle's QR code to access the vehicle ID.</p>
          {error && <div style={{background:"var(--red-dim)",color:"var(--red)",padding:"8px 12px",borderRadius:"var(--radius)",fontSize:13,marginBottom:12}}>{error}</div>}
          <div className="field">
            <label className="label">VIN / Serial Number / Vehicle ID</label>
            <div className="vin-search">
              <input className="input" value={vin} onChange={e=>setVin(e.target.value)} placeholder="Enter VIN, serial #, or QR code ID" onKeyDown={e=>e.key==="Enter"&&searchVehicle()} />
              <button className="btn btn-primary" onClick={searchVehicle}>Search</button>
            </div>
          </div>
        </>
      ) : !form ? (
        <>
          <div style={{background:"var(--green-dim)",border:"1px solid var(--green)",borderRadius:"var(--radius)",padding:16,marginBottom:16}}>
            <p style={{color:"var(--green)",fontWeight:600,fontSize:14,marginBottom:4}}>Vehicle Found</p>
            <p style={{fontSize:15,fontWeight:600}}>{found.isEquip ? `${found.item.year?found.item.year+" ":""}${found.item.make} ${found.item.model}` : `${found.item.year} ${found.item.make} ${found.item.model}`}</p>
            <p style={{color:"var(--text3)",fontSize:12}}>
              Owner: {foundOwner} · {found.isEquip ? "S/N" : "VIN"}: {found.isEquip ? (found.item.serial||"—") : (found.item.vin||"—")}
              {" · "}{found.isEquip?"Hours":"Mileage"}: {found.isEquip ? (found.item.hours||"—") : (found.item.mileage||"—")}
            </p>
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={()=>setFound(null)}>Search Again</button>
            <button className="btn btn-primary" onClick={startService}><I.Plus /> Log Service</button>
          </div>
        </>
      ) : (
        <>
          <p style={{fontSize:13,color:"var(--text3)",marginBottom:12}}>Logging service for: <strong>{found.isEquip ? `${found.item.make} ${found.item.model}` : `${found.item.year} ${found.item.make} ${found.item.model}`}</strong></p>
          <div className="field">
            <label className="label">Service Type</label>
            <select className="select" value={form.type} onChange={e=>set("type",e.target.value)}>
              {(found.isEquip ? E_SERVICE : V_SERVICE).map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
            <div className="field"><label className="label">Date</label><input className="input" type="date" value={form.date} onChange={e=>set("date",e.target.value)} /></div>
            <div className="field"><label className="label">{found.isEquip?"Hours":"Mileage"}</label><input className="input" type="number" value={form.usage} onChange={e=>set("usage",e.target.value)} /></div>
            <div className="field"><label className="label">Cost ($)</label><input className="input" type="number" step="0.01" value={form.cost} onChange={e=>set("cost",e.target.value)} placeholder="0.00" /></div>
            <div className="field"><label className="label">Your Shop Name</label><input className="input" value={form.provider} onChange={e=>set("provider",e.target.value)} placeholder="Shop name" /></div>
          </div>
          <div className="field"><label className="label">Service Notes</label><textarea className="input" value={form.notes} onChange={e=>set("notes",e.target.value)} placeholder="Work performed..." /></div>
          <div className="modal-actions">
            <button className="btn" onClick={()=>setForm(null)}>Back</button>
            <button className="btn btn-primary" onClick={submitService}>Submit Service Record</button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ─── Generic Modals ───
function AddVehicleModal({onClose,onSave}) {
  const [f,sf]=useState({year:"",make:"",model:"",vin:"",mileage:"",color:"",plate:""});
  const s=(k,v)=>sf(p=>({...p,[k]:v}));
  return <Modal onClose={onClose}><h2>Add Vehicle</h2>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
      <div className="field"><label className="label">Year</label><input className="input" value={f.year} onChange={e=>s("year",e.target.value)} placeholder="2024"/></div>
      <div className="field"><label className="label">Make</label><input className="input" value={f.make} onChange={e=>s("make",e.target.value)} placeholder="Toyota"/></div>
      <div className="field"><label className="label">Model</label><input className="input" value={f.model} onChange={e=>s("model",e.target.value)} placeholder="Camry"/></div>
      <div className="field"><label className="label">Color</label><input className="input" value={f.color} onChange={e=>s("color",e.target.value)} placeholder="Silver"/></div>
      <div className="field"><label className="label">Current Mileage</label><input className="input" type="number" value={f.mileage} onChange={e=>s("mileage",e.target.value)} placeholder="45000"/></div>
      <div className="field"><label className="label">License Plate</label><input className="input" value={f.plate} onChange={e=>s("plate",e.target.value)} placeholder="ABC-1234"/></div>
    </div>
    <div className="field"><label className="label">VIN</label><input className="input" value={f.vin} onChange={e=>s("vin",e.target.value)} placeholder="1HGCG5655WA..."/></div>
    <div className="modal-actions"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={()=>{if(f.year&&f.make&&f.model)onSave(f)}}>Add Vehicle</button></div>
  </Modal>;
}

function AddEquipmentModal({onClose,onSave}) {
  const [f,sf]=useState({category:"Lawn Mower",year:"",make:"",model:"",serial:"",hours:"",nickname:""});
  const s=(k,v)=>sf(p=>({...p,[k]:v}));
  return <Modal onClose={onClose}><h2>Add Equipment</h2>
    <div className="field"><label className="label">Category</label><select className="select" value={f.category} onChange={e=>s("category",e.target.value)}>{E_CATS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
      <div className="field"><label className="label">Year</label><input className="input" value={f.year} onChange={e=>s("year",e.target.value)} placeholder="2022"/></div>
      <div className="field"><label className="label">Make/Brand</label><input className="input" value={f.make} onChange={e=>s("make",e.target.value)} placeholder="John Deere"/></div>
      <div className="field"><label className="label">Model</label><input className="input" value={f.model} onChange={e=>s("model",e.target.value)} placeholder="Z930M"/></div>
      <div className="field"><label className="label">Nickname</label><input className="input" value={f.nickname} onChange={e=>s("nickname",e.target.value)} placeholder="Shop mower"/></div>
      <div className="field"><label className="label">Current Hours</label><input className="input" type="number" value={f.hours} onChange={e=>s("hours",e.target.value)} placeholder="350"/></div>
      <div className="field"><label className="label">Serial Number</label><input className="input" value={f.serial} onChange={e=>s("serial",e.target.value)} placeholder="1TC930M..."/></div>
    </div>
    <div className="modal-actions"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={()=>{if(f.make&&f.model)onSave(f)}}>Add Equipment</button></div>
  </Modal>;
}

function AddServiceModal({onClose,onSave,item,isEquipment}) {
  const types = isEquipment ? E_SERVICE : V_SERVICE;
  const uLabel = isEquipment?"Hours":"Mileage";
  const uVal = isEquipment?(item.hours||""):(item.mileage||"");
  const [f,sf]=useState({type:types[0],date:new Date().toISOString().split("T")[0],usage:uVal,cost:"",provider:"",notes:""});
  const s=(k,v)=>sf(p=>({...p,[k]:v}));
  const label = isEquipment?`${item.year?item.year+" ":""}${item.make} ${item.model}`:`${item.year} ${item.make} ${item.model}`;
  return <Modal onClose={onClose}><h2>Log Service</h2>
    <p style={{color:"var(--text3)",fontSize:13,marginBottom:16}}>{label}</p>
    <div className="field"><label className="label">Service Type</label><select className="select" value={f.type} onChange={e=>s("type",e.target.value)}>{types.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
      <div className="field"><label className="label">Date</label><input className="input" type="date" value={f.date} onChange={e=>s("date",e.target.value)}/></div>
      <div className="field"><label className="label">{uLabel}</label><input className="input" type="number" value={f.usage} onChange={e=>s("usage",e.target.value)}/></div>
      <div className="field"><label className="label">Cost ($)</label><input className="input" type="number" step="0.01" value={f.cost} onChange={e=>s("cost",e.target.value)} placeholder="0.00"/></div>
      <div className="field"><label className="label">Provider</label><input className="input" value={f.provider} onChange={e=>s("provider",e.target.value)} placeholder="Shop name"/></div>
    </div>
    <div className="field"><label className="label">Notes</label><textarea className="input" value={f.notes} onChange={e=>s("notes",e.target.value)} placeholder="Details..."/></div>
    <div className="modal-actions"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={()=>{if(f.type&&f.date)onSave(f)}}>Save Record</button></div>
  </Modal>;
}

function ShareModal({onClose,item,currentUser,onShare,isEquipment}) {
  const [u,su]=useState("");const [err,se]=useState("");
  const label = isEquipment?`${item.year?item.year+" ":""}${item.make} ${item.model}`:`${item.year} ${item.make} ${item.model}`;
  const go = async()=>{if(!u.trim())return;const t=u.toLowerCase();if(t===currentUser){se("That's you");return}const a=(await store.getS("accounts"))||{};if(!a[t]){se("User not found");return}onShare(t);onClose()};
  return <Modal onClose={onClose}><h2>Share {isEquipment?"Equipment":"Vehicle"}</h2>
    <p style={{color:"var(--text3)",fontSize:13,marginBottom:16}}>Share <strong>{label}</strong> so another user can add service records.</p>
    {err&&<div style={{background:"var(--red-dim)",color:"var(--red)",padding:"8px 12px",borderRadius:"var(--radius)",fontSize:13,marginBottom:12}}>{err}</div>}
    <div className="field"><label className="label">Username</label><input className="input" value={u} onChange={e=>su(e.target.value)} placeholder="Their username" onKeyDown={e=>e.key==="Enter"&&go()}/></div>
    <div className="modal-actions"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={go}><I.Share/> Share</button></div>
  </Modal>;
}

function TransferModal({onClose,item,currentUser,onTransfer,isEquipment}) {
  const [u,su]=useState("");const [err,se]=useState("");const [c,sc]=useState(false);
  const label = isEquipment?`${item.year?item.year+" ":""}${item.make} ${item.model}`:`${item.year} ${item.make} ${item.model}`;
  const go = async()=>{if(!u.trim())return;const t=u.toLowerCase();if(t===currentUser){se("Can't transfer to yourself");return}const a=(await store.getS("accounts"))||{};if(!a[t]){se("User not found");return}if(!c){sc(true);return}onTransfer(t);onClose()};
  return <Modal onClose={onClose}><h2>Transfer Ownership</h2>
    <p style={{color:"var(--text3)",fontSize:13,marginBottom:16}}>Transfer <strong>{label}</strong> and all history to another user.</p>
    {err&&<div style={{background:"var(--red-dim)",color:"var(--red)",padding:"8px 12px",borderRadius:"var(--radius)",fontSize:13,marginBottom:12}}>{err}</div>}
    <div className="field"><label className="label">New Owner's Username</label><input className="input" value={u} onChange={e=>{su(e.target.value);sc(false)}} placeholder="Username"/></div>
    {c&&<div style={{background:"var(--orange-dim)",color:"var(--orange)",padding:12,borderRadius:"var(--radius)",fontSize:13,marginBottom:12}}>Confirm? This permanently moves it to <strong>{u}</strong>.</div>}
    <div className="modal-actions"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={go}><I.Transfer/> {c?"Confirm":"Transfer"}</button></div>
  </Modal>;
}

// ─── Reminder Computation ───
function computeReminders(item, isEquip) {
  const records=item.records||[], reminders=[], now=Date.now();
  const intervals = isEquip ? E_REMIND : V_REMIND;
  const kind = isEquip ? "equipment" : "vehicle";
  for (const [type,interval] of Object.entries(intervals)) {
    const last=records.filter(r=>r.type===type).sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
    if(!last){reminders.push({type,status:"overdue",message:"No record found — may be overdue",item,kind});continue}
    const me=(now-new Date(last.date).getTime())/(1000*60*60*24*30);
    const ue = isEquip ? (item.hours&&last.usage?item.hours-last.usage:0) : (item.mileage&&last.usage?item.mileage-last.usage:0);
    const uKey = isEquip?"hours":"miles";
    const uLim = interval[uKey]||0;
    if((interval.months>0&&me>=interval.months)||(uLim>0&&ue>=uLim)) reminders.push({type,status:"overdue",message:`Last: ${last.date}`,item,kind});
    else if((interval.months>0&&me>=interval.months*.85)||(uLim>0&&ue>=uLim*.85)) reminders.push({type,status:"soon",message:`Due soon — last: ${last.date}`,item,kind});
  }
  return reminders;
}

// ─── Print Report ───
function printReport(item, isEquip) {
  const records=[...(item.records||[])].sort((a,b)=>new Date(b.date)-new Date(a.date));
  const total=records.reduce((s,r)=>s+(parseFloat(r.cost)||0),0);
  const title=isEquip?`${item.year?item.year+" ":""}${item.make} ${item.model}`:`${item.year} ${item.make} ${item.model}`;
  const uL=isEquip?"Hours":"Mileage", uU=isEquip?"hrs":"mi", uV=isEquip?item.hours:item.mileage;
  const hs = calcHealthScore(item, isEquip);
  const w=window.open("","_blank");
  w.document.write(`<!DOCTYPE html><html><head><title>Report - ${title}</title><style>body{font-family:Georgia,serif;max-width:800px;margin:40px auto;color:#1a1a1a;padding:0 20px}h1{font-size:24px;border-bottom:3px solid #333;padding-bottom:12px}h2{font-size:18px;margin-top:28px;color:#444;border-bottom:1px solid #ccc;padding-bottom:6px}.info{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:16px 0}.info div{font-size:14px}.info strong{color:#333}table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}th{text-align:left;border-bottom:2px solid #333;padding:8px 6px;font-size:12px;text-transform:uppercase;letter-spacing:.5px}td{border-bottom:1px solid #ddd;padding:8px 6px}.footer{margin-top:40px;text-align:center;font-size:12px;color:#999;border-top:1px solid #ccc;padding-top:16px}.summary{background:#f5f5f0;padding:16px;border-radius:8px;margin:16px 0;font-size:14px}.score-box{display:inline-block;background:#f0f0e8;padding:8px 16px;border-radius:8px;font-size:18px;font-weight:bold;margin:8px 0}@media print{body{margin:20px}}</style></head><body>
    <h1>${isEquip?"Equipment":"Vehicle"} Service Report</h1>
    <div class="info">
      <div><strong>${isEquip?"Equipment":"Vehicle"}:</strong> ${title}</div>
      ${isEquip?`<div><strong>Category:</strong> ${item.category||"N/A"}</div>`:`<div><strong>Color:</strong> ${item.color||"N/A"}</div>`}
      <div><strong>${isEquip?"Serial #":"VIN"}:</strong> ${isEquip?(item.serial||"N/A"):(item.vin||"N/A")}</div>
      ${!isEquip?`<div><strong>Plate:</strong> ${item.plate||"N/A"}</div>`:`<div><strong>Nickname:</strong> ${item.nickname||"N/A"}</div>`}
      <div><strong>Current ${uL}:</strong> ${uV?Number(uV).toLocaleString()+" "+uU:"N/A"}</div>
      <div><strong>Generated:</strong> ${new Date().toLocaleDateString()}</div>
    </div>
    <div class="summary"><strong>Health Score:</strong> <span class="score-box">${hs.grade} (${hs.score}/100)</span> — ${hs.detail}<br/><br/><strong>Summary:</strong> ${records.length} record${records.length!==1?"s":""} · Total: $${total.toFixed(2)}${records.length>0?" · Latest: "+records[0].date:""}</div>
    <h2>Complete Service History</h2>
    ${records.length===0?"<p>No records.</p>":`<table><tr><th>Date</th><th>Service</th><th>${uL}</th><th>Cost</th><th>Provider</th><th>Notes</th><th>Source</th></tr>${records.map(r=>`<tr><td>${r.date}</td><td>${r.type}</td><td>${r.usage?Number(r.usage).toLocaleString():"—"}</td><td>${r.cost?"$"+parseFloat(r.cost).toFixed(2):"—"}</td><td>${r.provider||"—"}</td><td>${r.notes||"—"}</td><td>${r.source==="shop"?"Shop":"Owner"}</td></tr>`).join("")}</table>`}
    <div class="footer"><p>Generated by MotorLedger · ${new Date().toLocaleString()}</p></div>
  </body></html>`);
  w.document.close();
  setTimeout(()=>w.print(),300);
}

// ═══════════════════════════════════════
// ─── Main App ───
// ═══════════════════════════════════════
export default function App() {
  const [user,setUser]=useState(null);
  const [displayName,setDisplayName]=useState("");
  const [vehicles,setVehicles]=useState([]);
  const [equipment,setEquipment]=useState([]);
  const [sel,setSel]=useState(null); // {data, type}
  const [tab,setTab]=useState("vehicles");
  const [showAddV,setShowAddV]=useState(false);
  const [showAddE,setShowAddE]=useState(false);
  const [showAddS,setShowAddS]=useState(false);
  const [showShare,setShowShare]=useState(false);
  const [showTransfer,setShowTransfer]=useState(false);
  const [showScan,setShowScan]=useState(false);
  const [showQR,setShowQR]=useState(false);
  const [showShop,setShowShop]=useState(false);
  const [toast,setToast]=useState("");
  const [loading,setLoading]=useState(true);
  const showToast=m=>{setToast(m);setTimeout(()=>setToast(""),2500)};

  const load = useCallback(async(userId)=>{
    const ud=(await store.get("user_"+userId))||{vehicles:[],equipment:[]};
    const sv=(await store.getS("shared_v_"+userId))||[];
    const allV=[...(ud.vehicles||[])];
    for(const ref of sv){const od=(await store.get("user_"+ref.owner))||{vehicles:[]};const v=(od.vehicles||[]).find(x=>x.id===ref.itemId);if(v&&!allV.find(x=>x.id===v.id))allV.push({...v,sharedFrom:ref.owner,isShared:true})}
    const se=(await store.getS("shared_e_"+userId))||[];
    const allE=[...(ud.equipment||[])];
    for(const ref of se){const od=(await store.get("user_"+ref.owner))||{equipment:[]};const e=(od.equipment||[]).find(x=>x.id===ref.itemId);if(e&&!allE.find(x=>x.id===e.id))allE.push({...e,sharedFrom:ref.owner,isShared:true})}
    setVehicles(allV);setEquipment(allE);setLoading(false);
  },[]);

  const save = useCallback(async(userId,vehs,equips)=>{
    await store.set("user_"+userId,{vehicles:vehs.filter(v=>!v.isShared),equipment:equips.filter(e=>!e.isShared)});
    for(const v of vehs.filter(x=>x.isShared)){const od=(await store.get("user_"+v.sharedFrom))||{vehicles:[],equipment:[]};const i=(od.vehicles||[]).findIndex(x=>x.id===v.id);if(i>=0){od.vehicles[i]={...v,isShared:undefined,sharedFrom:undefined};await store.set("user_"+v.sharedFrom,od)}}
    for(const e of equips.filter(x=>x.isShared)){const od=(await store.get("user_"+e.sharedFrom))||{vehicles:[],equipment:[]};const i=(od.equipment||[]).findIndex(x=>x.id===e.id);if(i>=0){od.equipment[i]={...e,isShared:undefined,sharedFrom:undefined};await store.set("user_"+e.sharedFrom,od)}}
  },[]);

  useEffect(()=>{if(user)load(user)},[user,load]);

  // ─── Auth ───
  const handleLogin=(userId,name)=>{setUser(userId);setDisplayName(name)};

  if(!user) return (<><style>{css}</style>
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"var(--bg)",padding:20}}>
      <div style={{maxWidth:400,width:"100%"}}>
        <div style={{textAlign:"center",marginBottom:40}}>
          <div className="logo-icon" style={{width:56,height:56,fontSize:22,margin:"0 auto 16px",borderRadius:14}}><I.Wrench/></div>
          <h1 style={{fontFamily:"var(--serif)",fontSize:34,fontWeight:400,letterSpacing:-.5}}>Motor<span style={{color:"var(--accent)"}}>Ledger</span></h1>
          <p style={{color:"var(--text3)",fontSize:14,marginTop:6}}>Vehicle & Equipment Maintenance</p>
        </div>
        <AuthForm onLogin={handleLogin}/>
      </div>
    </div>
  </>);

  // ─── CRUD ───
  const addVehicle=async f=>{const v={id:uid(),...f,mileage:parseInt(f.mileage)||0,records:[],sharedWith:[],created:Date.now()};const u=[...vehicles,v];setVehicles(u);await save(user,u,equipment);setShowAddV(false);showToast("Vehicle added!")};
  const addEquipment=async f=>{const e={id:uid(),...f,hours:parseInt(f.hours)||0,records:[],sharedWith:[],created:Date.now()};const u=[...equipment,e];setEquipment(u);await save(user,vehicles,u);setShowAddE(false);showToast("Equipment added!")};

  const addService=async f=>{
    const isE=sel.type==="equipment",id=sel.data.id;
    if(isE){const u=equipment.map(e=>{if(e.id!==id)return e;return{...e,hours:Math.max(e.hours||0,parseInt(f.usage)||e.hours),records:[...(e.records||[]),{id:uid(),...f,addedBy:displayName,addedAt:Date.now()}]}});setEquipment(u);setSel({data:u.find(e=>e.id===id),type:"equipment"});await save(user,vehicles,u)}
    else{const u=vehicles.map(v=>{if(v.id!==id)return v;return{...v,mileage:Math.max(v.mileage||0,parseInt(f.usage)||v.mileage),records:[...(v.records||[]),{id:uid(),...f,addedBy:displayName,addedAt:Date.now()}]}});setVehicles(u);setSel({data:u.find(v=>v.id===id),type:"vehicle"});await save(user,u,equipment)}
    setShowAddS(false);showToast("Service recorded!")};

  const handleScanParsed = async(parsed)=>{
    const f = {type:parsed.service_type||"Other",date:parsed.date||new Date().toISOString().split("T")[0],usage:parsed.usage||"",cost:parsed.cost||"",provider:parsed.provider||"",notes:parsed.notes||""};
    await addService(f);
    setShowScan(false);
    // If next service detected, add a note
    if(parsed.next_service_type||parsed.next_service_date){
      showToast(`Service logged! Next ${parsed.next_service_type||"service"} reminder set.`);
    }
  };

  const deleteRecord=async rid=>{
    const isE=sel.type==="equipment",id=sel.data.id;
    if(isE){const u=equipment.map(e=>e.id!==id?e:{...e,records:e.records.filter(r=>r.id!==rid)});setEquipment(u);setSel({data:u.find(e=>e.id===id),type:"equipment"});await save(user,vehicles,u)}
    else{const u=vehicles.map(v=>v.id!==id?v:{...v,records:v.records.filter(r=>r.id!==rid)});setVehicles(u);setSel({data:u.find(v=>v.id===id),type:"vehicle"});await save(user,u,equipment)}
    showToast("Record deleted")};

  const shareItem=async t=>{
    const isE=sel.type==="equipment",it=sel.data,sk=isE?"shared_e_":"shared_v_";
    const si=(await store.getS(sk+t))||[];if(!si.find(s=>s.itemId===it.id)){si.push({owner:it.isShared?it.sharedFrom:user,itemId:it.id});await store.setS(sk+t,si)}
    if(isE){const u=equipment.map(e=>{if(e.id!==it.id)return e;const sw=[...(e.sharedWith||[])];if(!sw.includes(t))sw.push(t);return{...e,sharedWith:sw}});setEquipment(u);setSel({data:u.find(e=>e.id===it.id),type:"equipment"});await save(user,vehicles,u)}
    else{const u=vehicles.map(v=>{if(v.id!==it.id)return v;const sw=[...(v.sharedWith||[])];if(!sw.includes(t))sw.push(t);return{...v,sharedWith:sw}});setVehicles(u);setSel({data:u.find(v=>v.id===it.id),type:"vehicle"});await save(user,u,equipment)}
    showToast(`Shared with ${t}!`)};

  const transferItem=async t=>{
    const isE=sel.type==="equipment",it=sel.data;
    const td=(await store.get("user_"+t))||{vehicles:[],equipment:[]};const ci={...it,isShared:undefined,sharedFrom:undefined,transferredFrom:user,transferDate:new Date().toISOString()};
    if(isE){td.equipment=[...(td.equipment||[]),ci];await store.set("user_"+t,td);const u=equipment.filter(e=>e.id!==it.id);setEquipment(u);await save(user,vehicles,u);for(const su of(it.sharedWith||[])){const si=(await store.getS("shared_e_"+su))||[];await store.setS("shared_e_"+su,si.filter(s=>s.itemId!==it.id))}}
    else{td.vehicles=[...(td.vehicles||[]),ci];await store.set("user_"+t,td);const u=vehicles.filter(v=>v.id!==it.id);setVehicles(u);await save(user,u,equipment);for(const su of(it.sharedWith||[])){const si=(await store.getS("shared_v_"+su))||[];await store.setS("shared_v_"+su,si.filter(s=>s.itemId!==it.id))}}
    setSel(null);showToast(`Transferred to ${t}!`)};

  const deleteItem=async()=>{
    const isE=sel.type==="equipment",id=sel.data.id;
    if(isE){const u=equipment.filter(e=>e.id!==id);setEquipment(u);await save(user,vehicles,u)}
    else{const u=vehicles.filter(v=>v.id!==id);setVehicles(u);await save(user,u,equipment)}
    setSel(null);showToast("Removed")};

  const allR=[...vehicles.flatMap(v=>computeReminders(v,false)),...equipment.flatMap(e=>computeReminders(e,true))];
  const oc=allR.filter(r=>r.status==="overdue").length;

  // ═══ Detail View ═══
  if(sel){
    const it=sel.data,isE=sel.type==="equipment";
    const records=[...(it.records||[])].sort((a,b)=>new Date(b.date)-new Date(a.date));
    const reminders=computeReminders(it,isE);
    const totalCost=records.reduce((s,r)=>s+(parseFloat(r.cost)||0),0);
    const uL=isE?"Hours":"Mileage", uU=isE?"hrs":"mi", uV=isE?it.hours:it.mileage;
    const title=isE?`${it.year?it.year+" ":""}${it.make} ${it.model}`:`${it.year} ${it.make} ${it.model}`;
    const sub=isE?[it.category,it.nickname,it.serial&&`S/N: ${it.serial}`].filter(Boolean).join(" · "):[it.vin&&`VIN: ${it.vin}`,it.plate&&`Plate: ${it.plate}`,it.color].filter(Boolean).join(" · ");
    const hs = calcHealthScore(it, isE);

    return <div className="app"><style>{css}</style>
      <div className="no-print">
        <button className="btn btn-ghost" onClick={()=>setSel(null)} style={{marginBottom:16}}>← Back</button>
        <div className="detail-header">
          <div>
            <h2>{title}{it.isShared&&<span className="shared-badge"><I.Users/> Shared</span>}</h2>
            <span style={{color:"var(--text3)",fontSize:14}}>{sub}</span>
          </div>
          <div className="detail-actions">
            <button className="btn btn-sm" onClick={()=>setShowScan(true)}><I.Scan/> Scan Receipt</button>
            <button className="btn btn-sm" onClick={()=>setShowAddS(true)}><I.Plus/> Log Service</button>
            <button className="btn btn-sm" onClick={()=>setShowQR(true)}><I.QR/> QR Code</button>
            <button className="btn btn-sm" onClick={()=>setShowShare(true)}><I.Share/> Share</button>
            {!it.isShared&&<button className="btn btn-sm" onClick={()=>setShowTransfer(true)}><I.Transfer/> Transfer</button>}
            <button className="btn btn-sm" onClick={()=>printReport(it,isE)}><I.Print/> Print</button>
            {!it.isShared&&<button className="btn btn-sm btn-danger" onClick={()=>{if(window.confirm("Delete?"))deleteItem()}}><I.Trash/></button>}
          </div>
        </div>
      </div>

      {/* Health Score Card */}
      <div className="score-card no-print">
        <ScoreRing score={hs.score} grade={hs.grade} color={hs.color}/>
        <div className="score-detail">
          <h4 style={{display:"flex",alignItems:"center",gap:6}}><I.Shield/> Maintenance Health Score</h4>
          <p>{hs.detail}</p>
          <div className="score-bar"><div className="score-bar-fill" style={{width:`${hs.score}%`,background:hs.color}}/></div>
        </div>
      </div>

      <div className="info-grid no-print">
        <div className="info-item"><div className="info-label">{uL}</div><div className="info-value">{uV?Number(uV).toLocaleString()+" "+uU:"—"}</div></div>
        <div className="info-item"><div className="info-label">Records</div><div className="info-value">{records.length}</div></div>
        <div className="info-item"><div className="info-label">Total Spent</div><div className="info-value">${totalCost.toFixed(2)}</div></div>
        <div className="info-item"><div className="info-label">Shared With</div><div className="info-value">{(it.sharedWith||[]).length}</div></div>
        {isE&&<div className="info-item"><div className="info-label">Category</div><div className="info-value" style={{fontSize:13}}>{it.category}</div></div>}
      </div>

      {reminders.length>0&&<div className="no-print" style={{marginBottom:24}}>
        <h3 style={{fontSize:16,fontWeight:600,marginBottom:12,display:"flex",alignItems:"center",gap:8}}><I.Bell/> Reminders</h3>
        {reminders.slice(0,5).map((r,i)=><div key={i} className="reminder-card"><div className={`reminder-dot ${r.status}`}/><div className="reminder-info"><h4>{r.type}</h4><p>{r.message}</p></div><button className="btn btn-sm" onClick={()=>setShowAddS(true)}>Log</button></div>)}
      </div>}

      <div>
        <h3 style={{fontSize:16,fontWeight:600,marginBottom:16}}>Service History</h3>
        {records.length===0?<div className="empty-state"><h3>No records yet</h3><p>Log your first service or scan a receipt.</p></div>:
        records.map(r=><div key={r.id} className="log-item">
          <div className={`log-dot ${isE?"equip-dot":""}`}/>
          <div className="log-content">
            <h4>{r.type}{r.source==="shop"&&<span style={{background:"var(--green-dim)",color:"var(--green)",padding:"2px 6px",borderRadius:4,fontSize:10,fontWeight:600,marginLeft:6}}>Shop</span>}</h4>
            <div className="log-meta">
              <span>{r.date}</span>
              {r.usage&&<span>{Number(r.usage).toLocaleString()} {uU}</span>}
              {r.cost&&<span>${parseFloat(r.cost).toFixed(2)}</span>}
              {r.provider&&<span>{r.provider}</span>}
              {r.addedBy&&<span>by {r.addedBy}</span>}
            </div>
            {r.notes&&<div className="log-notes">{r.notes}</div>}
          </div>
          <div className="log-actions no-print"><button className="btn btn-ghost btn-sm btn-danger" onClick={()=>deleteRecord(r.id)}><I.Trash/></button></div>
        </div>)}
      </div>

      {showAddS&&<AddServiceModal onClose={()=>setShowAddS(false)} onSave={addService} item={it} isEquipment={isE}/>}
      {showScan&&<ScanReceiptModal onClose={()=>setShowScan(false)} onParsed={handleScanParsed} item={it} isEquipment={isE}/>}
      {showQR&&<QRModal onClose={()=>setShowQR(false)} item={it} isEquipment={isE}/>}
      {showShare&&<ShareModal onClose={()=>setShowShare(false)} item={it} currentUser={user} onShare={shareItem} isEquipment={isE}/>}
      {showTransfer&&<TransferModal onClose={()=>setShowTransfer(false)} item={it} currentUser={user} onTransfer={transferItem} isEquipment={isE}/>}
      {toast&&<div className="toast">{toast}</div>}
    </div>;
  }

  // ═══ Dashboard ═══
  return <div className="app"><style>{css}</style>
    <div className="header no-print">
      <div className="logo"><div className="logo-icon"><I.Wrench/></div><h1>Motor<span>Ledger</span></h1></div>
      <div className="header-user">
        <span>Hi, <strong style={{color:"var(--text)"}}>{displayName}</strong></span>
        <button className="btn btn-sm" onClick={()=>setShowShop(true)}><I.Shop/> Shop Portal</button>
        <button className="btn btn-sm btn-ghost" onClick={()=>{setUser(null);setVehicles([]);setEquipment([]);setLoading(true)}}><I.Logout/> Sign Out</button>
      </div>
    </div>

    <div className="tabs no-print">
      <button className={`tab ${tab==="vehicles"?"active":""}`} onClick={()=>setTab("vehicles")}><I.Car/> My Vehicles</button>
      <button className={`tab ${tab==="equipment"?"active":""}`} onClick={()=>setTab("equipment")}><I.Equip/> My Equipment</button>
      <button className={`tab ${tab==="reminders"?"active":""}`} onClick={()=>setTab("reminders")}><I.Bell/> Reminders {oc>0&&<span style={{background:"var(--red)",color:"white",borderRadius:10,padding:"1px 7px",fontSize:11,fontWeight:700}}>{oc}</span>}</button>
    </div>

    {/* Vehicles */}
    {tab==="vehicles"&&<>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h2 style={{fontFamily:"var(--serif)",fontSize:22,fontWeight:400}}>{vehicles.length} Vehicle{vehicles.length!==1?"s":""}</h2>
        <button className="btn btn-primary" onClick={()=>setShowAddV(true)}><I.Plus/> Add Vehicle</button>
      </div>
      {vehicles.length===0?<div className="empty-state"><div style={{fontSize:48,marginBottom:16,opacity:.3}}><I.Car/></div><h3>No vehicles yet</h3><p style={{marginBottom:16}}>Add your first vehicle to start tracking.</p><button className="btn btn-primary" onClick={()=>setShowAddV(true)}><I.Plus/> Add Vehicle</button></div>:
      <div className="vehicle-grid">{vehicles.map(v=>{
        const hs=calcHealthScore(v,false);
        return <div key={v.id} className="vehicle-card" onClick={()=>setSel({data:v,type:"vehicle"})}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div><h3>{v.year} {v.make} {v.model}{v.isShared&&<span className="shared-badge"><I.Users/> Shared</span>}</h3>
            <div className="meta">{[v.color,v.plate].filter(Boolean).join(" · ")||"No details"}</div></div>
            <ScoreRing score={hs.score} grade={hs.grade} color={hs.color} size={52}/>
          </div>
          <div className="stats">
            <div className="stat"><strong>{v.mileage?Number(v.mileage).toLocaleString():"—"}</strong>miles</div>
            <div className="stat"><strong>{(v.records||[]).length}</strong>records</div>
            <div className="stat"><strong>${(v.records||[]).reduce((s,r)=>s+(parseFloat(r.cost)||0),0).toFixed(0)}</strong>spent</div>
          </div>
        </div>})}</div>}
    </>}

    {/* Equipment */}
    {tab==="equipment"&&<>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h2 style={{fontFamily:"var(--serif)",fontSize:22,fontWeight:400}}>{equipment.length} Piece{equipment.length!==1?"s":""} of Equipment</h2>
        <button className="btn btn-primary" onClick={()=>setShowAddE(true)}><I.Plus/> Add Equipment</button>
      </div>
      {equipment.length===0?<div className="empty-state"><div style={{fontSize:48,marginBottom:16,opacity:.3}}><I.Equip/></div><h3>No equipment yet</h3><p style={{marginBottom:16}}>Add mowers, trimmers, heavy equipment, and more.</p><button className="btn btn-primary" onClick={()=>setShowAddE(true)}><I.Plus/> Add Equipment</button></div>:
      <div className="vehicle-grid">{equipment.map(e=>{
        const hs=calcHealthScore(e,true);
        return <div key={e.id} className="vehicle-card equip-card" onClick={()=>setSel({data:e,type:"equipment"})}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div><div className="equip-badge"><I.Clock/> {e.category}</div>
            <h3>{e.year?e.year+" ":""}{e.make} {e.model}{e.isShared&&<span className="shared-badge"><I.Users/> Shared</span>}</h3>
            <div className="meta">{[e.nickname,e.serial&&`S/N: ${e.serial}`].filter(Boolean).join(" · ")||"No details"}</div></div>
            <ScoreRing score={hs.score} grade={hs.grade} color={hs.color} size={52}/>
          </div>
          <div className="stats">
            <div className="stat"><strong>{e.hours?Number(e.hours).toLocaleString():"—"}</strong>hours</div>
            <div className="stat"><strong>{(e.records||[]).length}</strong>records</div>
            <div className="stat"><strong>${(e.records||[]).reduce((s,r)=>s+(parseFloat(r.cost)||0),0).toFixed(0)}</strong>spent</div>
          </div>
        </div>})}</div>}
    </>}

    {/* Reminders */}
    {tab==="reminders"&&<>
      <h2 style={{fontFamily:"var(--serif)",fontSize:22,fontWeight:400,marginBottom:16}}>Service Reminders</h2>
      {allR.length===0?<div className="empty-state"><h3>All caught up!</h3><p>No upcoming reminders.</p></div>:<>
        {allR.filter(r=>r.status==="overdue").length>0&&<div style={{marginBottom:20}}>
          <h3 style={{fontSize:14,fontWeight:600,color:"var(--red)",marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>Overdue</h3>
          {allR.filter(r=>r.status==="overdue").map((r,i)=>{const l=r.kind==="equipment"?`${r.item.year?r.item.year+" ":""}${r.item.make} ${r.item.model}`:`${r.item.year} ${r.item.make} ${r.item.model}`;
          return <div key={i} className="reminder-card"><div className="reminder-dot overdue"/><div className="reminder-info"><h4>{r.type}<span className="reminder-type-badge" style={{background:r.kind==="equipment"?"var(--teal-dim)":"var(--accent-dim)",color:r.kind==="equipment"?"var(--teal)":"var(--accent)"}}>{r.kind==="equipment"?"Equip":"Vehicle"}</span></h4><p>{l} — {r.message}</p></div><button className="btn btn-sm" onClick={()=>setSel({data:r.item,type:r.kind})}>View</button></div>})}
        </div>}
        {allR.filter(r=>r.status==="soon").length>0&&<div>
          <h3 style={{fontSize:14,fontWeight:600,color:"var(--orange)",marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>Coming Soon</h3>
          {allR.filter(r=>r.status==="soon").map((r,i)=>{const l=r.kind==="equipment"?`${r.item.year?r.item.year+" ":""}${r.item.make} ${r.item.model}`:`${r.item.year} ${r.item.make} ${r.item.model}`;
          return <div key={i} className="reminder-card"><div className="reminder-dot soon"/><div className="reminder-info"><h4>{r.type}<span className="reminder-type-badge" style={{background:r.kind==="equipment"?"var(--teal-dim)":"var(--accent-dim)",color:r.kind==="equipment"?"var(--teal)":"var(--accent)"}}>{r.kind==="equipment"?"Equip":"Vehicle"}</span></h4><p>{l} — {r.message}</p></div><button className="btn btn-sm" onClick={()=>setSel({data:r.item,type:r.kind})}>View</button></div>})}
        </div>}
      </>}
    </>}

    {showAddV&&<AddVehicleModal onClose={()=>setShowAddV(false)} onSave={addVehicle}/>}
    {showAddE&&<AddEquipmentModal onClose={()=>setShowAddE(false)} onSave={addEquipment}/>}
    {showShop&&<ShopPortalModal onClose={()=>setShowShop(false)} onServiceAdded={()=>load(user)}/>}
    {toast&&<div className="toast">{toast}</div>}
  </div>;
}

// ─── Auth Form (extracted) ───
function AuthForm({onLogin}) {
  const [mode,setMode]=useState("login");
  const [username,setUsername]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const go=async()=>{
    if(!username.trim()||!password.trim()){setError("All fields required");return}
    const a=(await store.getS("accounts"))||{};
    if(mode==="register"){if(a[username.toLowerCase()]){setError("Username taken");return}a[username.toLowerCase()]={password,displayName:username,created:Date.now()};await store.setS("accounts",a);onLogin(username.toLowerCase(),username)}
    else{const ac=a[username.toLowerCase()];if(!ac||ac.password!==password){setError("Invalid credentials");return}onLogin(username.toLowerCase(),ac.displayName||username)}
  };
  return <div className="card" style={{padding:28}}>
    <div style={{display:"flex",gap:0,marginBottom:24}}>
      {["login","register"].map(m=><button key={m} onClick={()=>{setMode(m);setError("")}} style={{flex:1,padding:"10px",border:"none",borderBottom:mode===m?"2px solid var(--accent)":"2px solid transparent",background:"transparent",color:mode===m?"var(--accent)":"var(--text3)",fontFamily:"var(--font)",fontSize:14,fontWeight:600,cursor:"pointer"}}>{m==="login"?"Sign In":"Create Account"}</button>)}
    </div>
    {error&&<div style={{background:"var(--red-dim)",color:"var(--red)",padding:"8px 12px",borderRadius:"var(--radius)",fontSize:13,marginBottom:16}}>{error}</div>}
    <div className="field"><label className="label">Username</label><input className="input" value={username} onChange={e=>setUsername(e.target.value)} placeholder="Enter username" onKeyDown={e=>e.key==="Enter"&&go()}/></div>
    <div className="field"><label className="label">Password</label><input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter password" onKeyDown={e=>e.key==="Enter"&&go()}/></div>
    <button className="btn btn-primary" style={{width:"100%",padding:"12px",fontSize:15}} onClick={go}>{mode==="login"?"Sign In":"Create Account"}</button>
  </div>;
}
