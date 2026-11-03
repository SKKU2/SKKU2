/* ===== mini_pptx.js : 외부 라이브러리 없이 pptx(OOXML) 생성 =====
 * 텍스트 상자, 표, PNG 그림만 지원. ZIP은 무압축(STORE)으로 기록한다.
 */

const EMU = 914400; // 1 inch
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CT = 'application/vnd.openxmlformats-officedocument.presentationml';
const FONT = '맑은 고딕';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/* ---------- ZIP (STORE) ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zip(files) {
  const enc = new TextEncoder();
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const chunks = [], central = [];
  let offset = 0;
  files.forEach(f => {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    chunks.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  });
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = chunks.concat(central, [new Uint8Array(end.buffer)]);
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
  let p = 0;
  all.forEach(c => { out.set(c, p); p += c.length; });
  return out;
}

/* ---------- XML 조각 ---------- */
function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const emu = v => Math.round(v * EMU);
const hex = c => String(c || '000000').replace('#', '').toUpperCase();

function runXml(text, o) {
  const sz = Math.round((o.fontSize || 14) * 100);
  return `<a:r><a:rPr lang="ko-KR" altLang="en-US" sz="${sz}"${o.bold ? ' b="1"' : ''} dirty="0"><a:solidFill><a:srgbClr val="${hex(o.color || '1F2933')}"/></a:solidFill><a:latin typeface="${FONT}"/><a:ea typeface="${FONT}"/></a:rPr><a:t>${esc(text)}</a:t></a:r>`;
}
/** text: 문자열(줄바꿈=문단) 또는 [{text, bold, color, fontSize, bullet}] 문단 배열 */
function parasXml(text, o) {
  const paras = Array.isArray(text) ? text : String(text === null || text === undefined ? '' : text).split('\n').map(t => ({ text: t }));
  const algn = { left: 'l', center: 'ctr', right: 'r' }[o.align || 'left'];
  return paras.map(p => {
    const po = Object.assign({}, o, p);
    const bullet = p.bullet ? `<a:buFont typeface="Arial"/><a:buChar char="•"/>` : '<a:buNone/>';
    const pPr = `<a:pPr algn="${algn}"${p.bullet ? ' marL="228600" indent="-228600"' : ''}>${p.space ? `<a:spcBef><a:spcPts val="${p.space * 100}"/></a:spcBef>` : ''}${bullet}</a:pPr>`;
    const body = p.text === '' ? '' : runXml(p.text, po);
    return `<a:p>${pPr}${body}<a:endParaRPr lang="ko-KR" sz="${Math.round((po.fontSize || 14) * 100)}"/></a:p>`;
  }).join('');
}
function lineXml(o) {
  return o.line ? `<a:ln w="${Math.round((o.lineWidth || 1) * 12700)}"><a:solidFill><a:srgbClr val="${hex(o.line)}"/></a:solidFill></a:ln>` : '<a:ln><a:noFill/></a:ln>';
}

class Slide {
  constructor(idx) { this.idx = idx; this.shapes = []; this.images = []; this.nextId = 2; this.bg = null; }
  addText(text, o) {
    const id = this.nextId++;
    const anchor = { top: 't', middle: 'ctr', bottom: 'b' }[o.valign || 'top'];
    const ins = emu(o.inset === undefined ? 0.08 : o.inset);
    this.shapes.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(o.x)}" y="${emu(o.y)}"/><a:ext cx="${emu(o.w)}" cy="${emu(o.h)}"/></a:xfrm><a:prstGeom prst="${o.shape || 'rect'}"><a:avLst/></a:prstGeom>${o.fill ? `<a:solidFill><a:srgbClr val="${hex(o.fill)}"/></a:solidFill>` : '<a:noFill/>'}${lineXml(o)}</p:spPr><p:txBody><a:bodyPr wrap="square" lIns="${ins}" tIns="${ins}" rIns="${ins}" bIns="${ins}" rtlCol="0" anchor="${anchor}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${parasXml(text, o)}</p:txBody></p:sp>`);
    return this;
  }
  addRect(o) { return this.addText('', Object.assign({ inset: 0 }, o)); }
  /** rows: [[{text, bold, fill, color, align, fontSize} | string]] */
  addTable(rows, o) {
    const id = this.nextId++;
    const cols = o.colW;
    const totalW = cols.reduce((s, c) => s + c, 0);
    const rowH = o.rowH || 0.4;
    const border = hex(o.border || 'B8C2CC');
    const ln = side => `<a:${side} w="9525"><a:solidFill><a:srgbClr val="${border}"/></a:solidFill></a:${side}>`;
    const trs = rows.map((row, ri) => {
      const h = Array.isArray(o.rowHs) ? o.rowHs[ri] || rowH : rowH;
      const tcs = row.map(cell => {
        const c = typeof cell === 'object' && cell !== null ? cell : { text: cell };
        const co = Object.assign({ fontSize: o.fontSize || 12 }, c);
        const fill = c.fill ? `<a:solidFill><a:srgbClr val="${hex(c.fill)}"/></a:solidFill>` : '<a:noFill/>';
        return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${parasXml(c.text, co)}</a:txBody><a:tcPr marL="68580" marR="68580" marT="45720" marB="45720" anchor="ctr">${ln('lnL')}${ln('lnR')}${ln('lnT')}${ln('lnB')}${fill}</a:tcPr></a:tc>`;
      }).join('');
      return `<a:tr h="${emu(h)}">${tcs}</a:tr>`;
    }).join('');
    const totalH = rows.reduce((s, _, ri) => s + (Array.isArray(o.rowHs) ? o.rowHs[ri] || rowH : rowH), 0);
    this.shapes.push(`<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${emu(o.x)}" y="${emu(o.y)}"/><a:ext cx="${emu(totalW)}" cy="${emu(totalH)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>${cols.map(c => `<a:gridCol w="${emu(c)}"/>`).join('')}</a:tblGrid>${trs}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`);
    return this;
  }
  /** data: PNG Uint8Array */
  addImage(data, o) {
    const id = this.nextId++;
    const rid = `rId${this.images.length + 2}`;
    this.images.push({ rid, data });
    this.shapes.push(`<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${emu(o.x)}" y="${emu(o.y)}"/><a:ext cx="${emu(o.w)}" cy="${emu(o.h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`);
    return this;
  }
  xml() {
    return `${XML_HEAD}<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${this.shapes.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  }
}

const THEME = `${XML_HEAD}<a:theme xmlns:a="${NS_A}" name="WxBrief"><a:themeElements><a:clrScheme name="WxBrief"><a:dk1><a:srgbClr val="1F2933"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1D3557"/></a:dk2><a:lt2><a:srgbClr val="EEF2F6"/></a:lt2><a:accent1><a:srgbClr val="1D4E89"/></a:accent1><a:accent2><a:srgbClr val="2E7D32"/></a:accent2><a:accent3><a:srgbClr val="B7791F"/></a:accent3><a:accent4><a:srgbClr val="C62828"/></a:accent4><a:accent5><a:srgbClr val="5C6B7A"/></a:accent5><a:accent6><a:srgbClr val="0F766E"/></a:accent6><a:hlink><a:srgbClr val="1D4E89"/></a:hlink><a:folHlink><a:srgbClr val="5B3A8C"/></a:folHlink></a:clrScheme><a:fontScheme name="WxBrief"><a:majorFont><a:latin typeface="${FONT}"/><a:ea typeface="${FONT}"/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${FONT}"/><a:ea typeface="${FONT}"/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="WxBrief"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;

const EMPTY_TREE = '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>';

const MASTER = `${XML_HEAD}<p:sldMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>${EMPTY_TREE}</p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="3200"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`;

const LAYOUT = `${XML_HEAD}<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" type="blank" preserve="1"><p:cSld name="Blank">${EMPTY_TREE}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

function rels(list) {
  return `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(r => `<Relationship Id="${r[0]}" Type="${r[1]}" Target="${r[2]}"/>`).join('')}</Relationships>`;
}

class MiniPptx {
  constructor(o) {
    o = o || {};
    this.title = o.title || '';
    this.author = o.author || '';
    this.slides = [];
    this.W = 13.333; this.H = 7.5;
  }
  addSlide() { const s = new Slide(this.slides.length + 1); this.slides.push(s); return s; }
  build() {
    const files = [];
    const n = this.slides.length;
    const hasPng = this.slides.some(s => s.images.length);
    files.push({
      name: '[Content_Types].xml',
      data: `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${hasPng ? '<Default Extension="png" ContentType="image/png"/>' : ''}<Override PartName="/ppt/presentation.xml" ContentType="${CT}.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${CT}.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="${CT}.slideLayout+xml"/>${this.slides.map(s => `<Override PartName="/ppt/slides/slide${s.idx}.xml" ContentType="${CT}.slide+xml"/>`).join('')}<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/presProps.xml" ContentType="${CT}.presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="${CT}.viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="${CT}.tableStyles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`
    });
    files.push({
      name: '_rels/.rels',
      data: rels([
        ['rId1', `${REL}/officeDocument`, 'ppt/presentation.xml'],
        ['rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml'],
        ['rId3', `${REL}/extended-properties`, 'docProps/app.xml']
      ])
    });
    const iso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    files.push({
      name: 'docProps/core.xml',
      data: `${XML_HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(this.title)}</dc:title><dc:creator>${esc(this.author)}</dc:creator><cp:lastModifiedBy>${esc(this.author)}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`
    });
    files.push({
      name: 'docProps/app.xml',
      data: `${XML_HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Office PowerPoint</Application><PresentationFormat>와이드스크린</PresentationFormat><Slides>${n}</Slides></Properties>`
    });
    files.push({
      name: 'ppt/presentation.xml',
      data: `${XML_HEAD}<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${this.slides.map(s => `<p:sldId id="${255 + s.idx}" r:id="rId${s.idx + 1}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${emu(this.W)}" cy="${emu(this.H)}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:defPPr><a:defRPr lang="ko-KR"/></a:defPPr></p:defaultTextStyle></p:presentation>`
    });
    const pr = [['rId1', `${REL}/slideMaster`, 'slideMasters/slideMaster1.xml']];
    this.slides.forEach(s => pr.push([`rId${s.idx + 1}`, `${REL}/slide`, `slides/slide${s.idx}.xml`]));
    pr.push([`rId${n + 2}`, `${REL}/theme`, 'theme/theme1.xml']);
    pr.push([`rId${n + 3}`, `${REL}/presProps`, 'presProps.xml']);
    pr.push([`rId${n + 4}`, `${REL}/viewProps`, 'viewProps.xml']);
    pr.push([`rId${n + 5}`, `${REL}/tableStyles`, 'tableStyles.xml']);
    files.push({ name: 'ppt/_rels/presentation.xml.rels', data: rels(pr) });
    files.push({ name: 'ppt/presProps.xml', data: `${XML_HEAD}<p:presentationPr xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"/>` });
    files.push({ name: 'ppt/viewProps.xml', data: `${XML_HEAD}<p:viewPr xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>` });
    files.push({ name: 'ppt/tableStyles.xml', data: `${XML_HEAD}<a:tblStyleLst xmlns:a="${NS_A}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>` });
    files.push({ name: 'ppt/theme/theme1.xml', data: THEME });
    files.push({ name: 'ppt/slideMasters/slideMaster1.xml', data: MASTER });
    files.push({ name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: rels([['rId1', `${REL}/slideLayout`, '../slideLayouts/slideLayout1.xml'], ['rId2', `${REL}/theme`, '../theme/theme1.xml']]) });
    files.push({ name: 'ppt/slideLayouts/slideLayout1.xml', data: LAYOUT });
    files.push({ name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: rels([['rId1', `${REL}/slideMaster`, '../slideMasters/slideMaster1.xml']]) });
    let imgNo = 0;
    this.slides.forEach(s => {
      const r = [['rId1', `${REL}/slideLayout`, '../slideLayouts/slideLayout1.xml']];
      s.images.forEach(im => {
        imgNo++;
        files.push({ name: `ppt/media/image${imgNo}.png`, data: im.data });
        r.push([im.rid, `${REL}/image`, `../media/image${imgNo}.png`]);
      });
      files.push({ name: `ppt/slides/slide${s.idx}.xml`, data: s.xml() });
      files.push({ name: `ppt/slides/_rels/slide${s.idx}.xml.rels`, data: rels(r) });
    });
    return zip(files);
  }
  toBlob() {
    return new Blob([this.build()], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  }
}

export { MiniPptx };
export { zip, crc32 };
