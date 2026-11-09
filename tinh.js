// tinh.js – BẢN XEM TRỰC TUYẾN (web tĩnh, chỉ xem)
// Thay máy chủ Python: mọi lời gọi /api/... được trả lời từ các tệp trong du_lieu/ do web/xuat_web_tinh.py xuất ra.
// Giữ nguyên định dạng dữ liệu của máy chủ thật → giao diện index.html dùng lại được, không phải sửa.
(() => {
  const cache = {};
  const mot = (k, f) => cache[k] || (cache[k] = f());
  const lay = async (ten, nhiPhan) => {
    const r = await fetch("du_lieu/" + ten);
    if (!r.ok) throw new Error("Không tải được dữ liệu " + ten);
    return nhiPhan ? r.arrayBuffer() : r.json();
  };
  const TQ = () => mot("tq", () => lay("tong_quan.json"));
  const HINH = () => mot("hinh", () => lay("phuong_hinh.json"));
  const PH = id => mot("ph" + id, () => lay(`phuong_${id}.json`).catch(() => ({ bo:{}, ky:{} })));
  const LUOI = async (bo, cs) => {
    const t = await TQ(), ten = t.tep_luoi[`${bo}|${cs}`];
    if (!ten) return null;
    return mot("l" + ten, async () => new Int16Array(await lay(ten, true)));
  };
  const VT = { LST:1, NDVI:2, TVDI:3 };
  let viTri = null;                                   // vị trí ô trong lưới → chỉ số trong tệp nhị phân

  async function traLoi(duong) {
    const u = new URL(duong, location.href), p = u.pathname.replace(/^.*\/api\//, "/api/"), q = Object.fromEntries(u.searchParams);
    const t = await TQ();
    switch (p) {
      case "/api/toi": return { ten:"khach", ten_hien:"Khách", vai_tro:"xem", ten_vai_tro:"Bản xem trực tuyến" };
      case "/api/tong_quan": return t.tq;
      case "/api/mo_hinh": return t.mo_hinh;
      case "/api/phuong/hinh": return HINH();
      case "/api/kho": return [];
      case "/api/ky": return ((t.ky[q.bo] || {})[q.cs] || []).map(([ky, so_o, tong_o]) => ({ ky, so_o, tong_o }));
      case "/api/phuong": {
        const d = await PH(q.bo), ky = q.ky.length >= 10 ? q.ky.slice(0, 10) : q.ky.slice(0, 7) + "-01";
        return { ky, bo:d.bo, rows:(d.ky[ky] || []).map(([id, L, N, T, n]) => ({ id, LST:L, NDVI:N, TVDI:T, LST_n:n })) };
      }
      case "/api/lop": {
        const L = t.luoi, ky = q.ky.length >= 10 ? q.ky.slice(0, 10) : q.ky.slice(0, 7) + "-01", ds = (t.ky[q.bo] || {})[q.cs] || [];
        const m = ds.findIndex(k => k[0] === ky), a = await LUOI(q.bo, q.cs), n = L.k.length, hs = L.he_so[q.cs];
        const v = new Array(L.w * L.h).fill(null);
        let so = 0;
        if (a && m >= 0) for (let i = 0; i < n; i++) { const x = a[m * n + i]; if (x !== -32768) { v[L.k[i]] = Math.round(x / hs * 1000) / 1000; so++; } }
        return { w:L.w, h:L.h, res:L.res, bounds:L.bounds, v, so_o:so, top_xa:[] };
      }
      case "/api/chuoi": {                             // chuỗi tại 1 ô lưới
        const L = t.luoi, [[s, w], [nB, e]] = L.bounds, lon = +q.lon, lat = +q.lat;
        const cot = Math.floor((lon - w) / (e - w) * L.w), hang = Math.floor((nB - lat) / (nB - s) * L.h);
        if (cot < 0 || hang < 0 || cot >= L.w || hang >= L.h) return [];
        if (!viTri) { viTri = new Map(); L.k.forEach((k, i) => viTri.set(k, i)); }
        const i = viTri.get(hang * L.w + cot); if (i == null) return [];
        const kq = [], n = L.k.length, hs = L.he_so[q.cs];
        for (const b of t.tq.bo_du_lieu) {
          const ds = (t.ky[b.id] || {})[q.cs]; if (!ds) continue;
          const a = await LUOI(b.id, q.cs); if (!a) continue;
          ds.forEach((k, m) => { const x = a[m * n + i]; if (x !== -32768) kq.push({ bo_du_lieu:b.ma, loai:b.loai, ky:k[0], gia_tri:x / hs }); });
        }
        return kq.sort((a, b) => a.ky.localeCompare(b.ky));
      }
      case "/api/phuong/chuoi": case "/api/chuoi_vung": {
        const vung = +(q.id || q.vung || 0), cs = q.cs, chiVung = p === "/api/chuoi_vung";
        if (chiVung && vung === 0) return t.chuoi_vung[cs] || [];
        const kq = [];
        for (const b of t.tq.bo_du_lieu) {
          if (b.loai === "DU_BAO" && b.chi_so_du_bao !== cs) continue;
          if (!t.ky[b.id] || !Object.keys(t.ky[b.id]).length) continue;
          const d = await PH(b.id);
          for (const [ky, rows] of Object.entries(d.ky)) {
            const r = rows.find(x => x[0] === vung); if (!r || r[VT[cs]] == null) continue;
            kq.push(chiVung ? { bo_id:b.id, bo:b.ma, loai:b.loai, mo_hinh:b.mo_hinh, kich_ban:b.kich_ban, ky, tb:r[VT[cs]], p10:null, p90:null, so_pixel:r[4] }
                            : { bo:b.ma, loai:b.loai, ky, tb:r[VT[cs]], n:r[4] });
          }
        }
        return kq.sort((a, b) => a.ky.localeCompare(b.ky));
      }
      case "/api/ds_vung": return (await HINH()).features.map(f => ({ id:f.id, ten:f.properties.ten, cap:"XA", hien_hanh:true }));
      default: throw new Error("Bản xem trực tuyến chỉ để xem – chức năng này có trên phần mềm đầy đủ");
    }
  }
  // thay hàm api() của trang
  api = async (duong) => traLoi(duong);

  // giao diện: bỏ những gì cần máy chủ
  const an = s => document.querySelectorAll(s).forEach(e => e.style.display = "none");
  an("#nut-tai-tif"); an('nav button[data-tab="kho"]'); an("#m-mk"); an('#menu-nguoi a[href="/dang-xuat"]');
  TQ().then(t => {
    const p = document.querySelector("header .phu");
    if (p) p.textContent += ` · Bản xem trực tuyến (dữ liệu xuất ngày ${t.ngay_xuat.split("-").reverse().join("/")})`;
  }).catch(() => {});
  document.getElementById("nut-nguoi").onclick = e => e.stopPropagation();
})();
