// UNERGY · Gestión de Fallas — Code.gs v12
// POST con text/plain evita preflight CORS
// PropertiesService por chunks separados (max 9KB c/u)

var SHEET_NAME     = "Fallas";
var ROOT_FOLDER_ID = "1aZ_nHnlhi6aPK5l_Gp87qOsDkmMJ1De3";
var HEADERS = [
  "ID","Proyecto","Código de Falla","Descripción Falla","Categoría",
  "Estado","Fecha de Identificación","Hora de Identificación",
  "Fecha y Hora de Ocurrencia","Tipo Resolución","Descripción",
  "Seguimiento","Fotos (Enlace Drive)","Fecha y Hora de Terminación",
  "Centinela","Fecha Registro","Última Actualización"
];

// ──────────────── ENRUTADOR GET ────────────────────────
function doGet(e) {
  var p = e && e.parameter ? e.parameter : {};
  var a = p.action || "html";
  if (a === "html") {
    try {
      var pg = HtmlService.createHtmlOutputFromFile("index");
      pg.setTitle("Unergy · Fallas");
      pg.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      pg.addMetaTag("viewport","width=device-width,initial-scale=1.0");
      return pg;
    } catch(err) { return HtmlService.createHtmlOutput(err.message); }
  }
  if (a === "getFaults")   return J(getFaults());
  if (a === "deleteFault") return J(deleteFault(p.id||""));
  if (a === "getDriveUrl") return J(getDriveUrl(p.faultId||""));
  if (a === "saveFault") {
    try { return J(saveFault(JSON.parse(decodeURIComponent(p.data||"{}")))); }
    catch(err) { return J({ok:false,error:err.message}); }
  }
  return J({ok:false,error:"acción desconocida: "+a});
}

// ──────────────── ENRUTADOR POST ───────────────────────
// Usa Content-Type: text/plain → sin preflight CORS
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents||"{}");
    var a = body.action||"";
    if (a === "savePhoto")  return J(savePhoto(body));
    if (a === "saveFault")  return J(saveFault(body.data||{}));
    return J({ok:false,error:"POST acción desconocida: "+a});
  } catch(err) {
    return J({ok:false,error:err.message});
  }
}

function J(d){
  return ContentService.createTextOutput(JSON.stringify(d))
         .setMimeType(ContentService.MimeType.JSON);
}

// ──────────────── FOTO → DRIVE ─────────────────────────
function savePhoto(body) {
  try {
    var faultId   = String(body.faultId   ||"");
    var project   = String(body.project   ||"Sin_Proyecto");
    var faultCode = String(body.faultCode ||"");
    var faultLabel= String(body.faultLabel||"");
    var dateStr   = String(body.dateStr   ||"");
    var photoName = String(body.photoName ||"foto.jpg");
    var mimeType  = String(body.mimeType  ||"image/jpeg");
    var b64       = String(body.b64       ||"");
    if (!b64) return {ok:false, error:"Sin imagen"};

    var folder = proyFolder(project);
    var name   = fotoNombre(faultCode, faultLabel, dateStr, photoName);
    var bytes  = Utilities.base64Decode(b64);
    folder.createFile(Utilities.newBlob(bytes, mimeType, name));
    compartir(folder);

    var url = folder.getUrl();
    // Guardar URL en caché para recuperarla después
    cacheSet("fu_"+faultId, url);
    return {ok:true, folderUrl:url};
  } catch(err) {
    return {ok:false, error:err.message};
  }
}

function getDriveUrl(faultId) {
  var url = cacheGet("fu_"+faultId)||"";
  return {ok:true, folderUrl:url};
}

// ──────────────── PropertiesService helpers ─────────────
// Máx 9 KB por propiedad → fragmentamos si hace falta
var CACHE_MAX = 8000;

function cacheSet(key, val) {
  try {
    var props = PropertiesService.getScriptProperties();
    if (val.length <= CACHE_MAX) {
      props.setProperty(key, val);
      props.setProperty(key+"_n","1");
    } else {
      var n = Math.ceil(val.length / CACHE_MAX);
      for (var i=0;i<n;i++){
        props.setProperty(key+"_"+i, val.slice(i*CACHE_MAX,(i+1)*CACHE_MAX));
      }
      props.setProperty(key+"_n", String(n));
    }
  } catch(e){Logger.log("cacheSet:"+e.message);}
}

function cacheGet(key) {
  try {
    var props = PropertiesService.getScriptProperties();
    var n = parseInt(props.getProperty(key+"_n")||"0");
    if (n<=1) return props.getProperty(key)||"";
    var out="";
    for(var i=0;i<n;i++) out+=props.getProperty(key+"_"+i)||"";
    return out;
  } catch(e){return "";}
}

function cacheDel(key) {
  try {
    var props=PropertiesService.getScriptProperties();
    var n=parseInt(props.getProperty(key+"_n")||"0");
    if(n>1)for(var i=0;i<n;i++)try{props.deleteProperty(key+"_"+i);}catch(e){}
    try{props.deleteProperty(key);}catch(e){}
    try{props.deleteProperty(key+"_n");}catch(e){}
  }catch(e){}
}

// ──────────────── Helpers Drive ────────────────────────
function proyFolder(project) {
  var safe = project.replace(/[\/\\:*?"<>|]/g,"_").trim()||"Sin_Proyecto";
  var root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var it   = root.getFoldersByName(safe);
  return it.hasNext() ? it.next() : root.createFolder(safe);
}

function fotoNombre(code, label, dateStr, photoName) {
  var ext  = String(photoName||"foto.jpg").split(".").pop()||"jpg";
  var base = (code+"_"+label+"_"+dateStr)
               .replace(/[\/\\:*?"<>|]/g,"_").replace(/\s+/g,"_").slice(0,70);
  return base+"_"+String(Date.now()).slice(-6)+"."+ext;
}

function compartir(folder){
  try{folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);}catch(e){}
}

// ──────────────── HOJA ─────────────────────────────────
function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) { sh = ss.insertSheet(SHEET_NAME); ponerHeaders(sh); return sh; }
  try {
    var maxC = sh.getMaxColumns();
    if (maxC < HEADERS.length) sh.insertColumnsAfter(maxC, HEADERS.length - maxC);
    var cur  = sh.getRange(1,1,1,HEADERS.length).getValues()[0];
    var bad  = HEADERS.some(function(h,i){return String(cur[i]||"").trim()!==h;});
    if (bad) ponerHeaders(sh);
  } catch(e){Logger.log("getSheet:"+e.message);}
  return sh;
}

function ponerHeaders(sh) {
  try {
    var maxC=sh.getMaxColumns();
    if(maxC<HEADERS.length) sh.insertColumnsAfter(maxC,HEADERS.length-maxC);
    var r=sh.getRange(1,1,1,HEADERS.length);
    r.setValues([HEADERS]);
    r.setBackground("#2C2039");r.setFontColor("#F6FF72");
    r.setFontWeight("bold");r.setFontSize(11);r.setHorizontalAlignment("center");
    sh.setFrozenRows(1);
    [90,180,110,250,160,110,140,110,170,180,300,300,220,170,220,130,140]
      .forEach(function(w,i){sh.setColumnWidth(i+1,w);});
  }catch(e){}
}

function celda(v, hdr) {
  if (v instanceof Date) {
    var y=v.getFullYear(),hh=String(v.getHours()).padStart(2,"0"),mm=String(v.getMinutes()).padStart(2,"0");
    if (y<1971) return hh+":"+mm;
    var dd=String(v.getDate()).padStart(2,"0"),mo=String(v.getMonth()+1).padStart(2,"0");
    return dd+"/"+mo+"/"+y+" "+hh+":"+mm;
  }
  return v!==undefined ? String(v) : "";
}

function colorFila(sh,row,st){
  if(!sh||!row)return;
  var c={activa:"#FFEDED",revision:"#FFFDE7",programada:"#F3EEF9",terminada:"#EDFFF4"};
  try{sh.getRange(row,1,1,HEADERS.length).setBackground(c[st]||"#FFFFFF");}catch(e){}
}

function buscarFila(sh,id){
  if(!sh)return -1;
  try{var v=sh.getDataRange().getValues();for(var i=1;i<v.length;i++)if(String(v[i][0])===String(id))return i+1;}catch(e){}
  return -1;
}

// ──────────────── LEER FALLAS ──────────────────────────
function getFaults(){
  try{
    var sh=getSheet(),data=sh.getDataRange().getValues();
    if(data.length<=1)return{ok:true,faults:[]};
    var hdrs=data[0],out=[];
    for(var i=1;i<data.length;i++){
      var o={};
      for(var j=0;j<hdrs.length;j++) o[String(hdrs[j]||"")]=celda(data[i][j],String(hdrs[j]||""));
      out.push(o);
    }
    return{ok:true,faults:out};
  }catch(e){return{ok:false,error:e.message};}
}

// ──────────────── GUARDAR FALLA ────────────────────────
function saveFault(f){
  try{
    var sh=getSheet();
    var now=Utilities.formatDate(new Date(),"America/Bogota","dd/MM/yyyy HH:mm");
    var row=[
      f.id||"",             // A
      f.project||"",        // B
      f.faultCode||"",      // C
      f.faultLabel||"",     // D
      f.categoryLabel||"",  // E
      f.statusLabel||"",    // F
      f.identDate||"",      // G  Fecha Identificación
      f.identTime||"",      // H  Hora Identificación
      f.occTime||"",        // I  Ocurrencia
      f.resType||"",        // J  Tipo Resolución
      f.desc||"",           // K  Descripción
      f.followUp||"",       // L  Seguimiento
      f.driveUrl||"",       // M  Fotos Drive
      f.endTime||"",        // N  Terminación
      f.centinela||"",      // O
      "",                   // P  Fecha Registro
      now                   // Q  Última Actlz.
    ];
    var ex=buscarFila(sh,f.id);
    if(ex===-1){
      row[15]=now;
      sh.appendRow(row);
      colorFila(sh,sh.getLastRow(),f.status);
      return{ok:true,action:"created"};
    }
    try{row[15]=String(sh.getRange(ex,16).getValue()||"")||now;}catch(e){row[15]=now;}
    // Conservar campos si vienen vacíos
    if(!f.driveUrl)   try{row[12]=celda(sh.getRange(ex,13).getValue(),"");}catch(e){}
    if(!f.occTime)    try{row[8] =celda(sh.getRange(ex, 9).getValue(),"Fecha y Hora de Ocurrencia");}catch(e){}
    if(!f.endTime&&f.status!=="terminada") try{row[13]=celda(sh.getRange(ex,14).getValue(),"Fecha y Hora de Terminación");}catch(e){}
    sh.getRange(ex,1,1,HEADERS.length).setValues([row]);
    colorFila(sh,ex,f.status);
    return{ok:true,action:"updated"};
  }catch(e){return{ok:false,error:e.message};}
}

function deleteFault(id){
  try{var s=getSheet(),r=buscarFila(s,id);if(r===-1)return{ok:false,error:"no encontrada"};s.deleteRow(r);return{ok:true};}
  catch(e){return{ok:false,error:e.message};}
}

function testConexion(){
  var r=getFaults();Logger.log("OK:"+r.ok+" n:"+(r.faults||[]).length);
}
