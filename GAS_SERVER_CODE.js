
// ==========================================
// 將此代碼複製到 Google Sheet > 擴充功能 > Apps Script
// 最後更新：修復 getDataRange null 錯誤與自動補全表頭
// ==========================================

const SCRIPT_PROP = PropertiesService.getScriptProperties();

function setup() {
  const doc = SpreadsheetApp.getActiveSpreadsheet();
  getOrInitSheet(doc, "Surveys");
  getOrInitSheet(doc, "Responses");
}

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(30000);

  try {
    const doc = SpreadsheetApp.getActiveSpreadsheet();
    if (!doc) throw new Error("無法取得試算表，請確認腳本已綁定至 Google Sheet (Container-bound script)");

    const action = e.parameter.action;
    
    // 處理 POST 數據
    let postData = null;
    if (e.postData && e.postData.contents) {
      try {
        postData = JSON.parse(e.postData.contents);
      } catch (err) {
        // Ignore invalid JSON
      }
    }

    let result = {};

    if (action === "getSurveys") {
      const sheet = getOrInitSheet(doc, "Surveys");
      const data = getData(sheet);
      // 將 createdAt 轉回數字，並確保 pin 為字串
      result = data.map(row => ({
        ...row,
        createdAt: Number(row.createdAt),
        pin: row.pin ? String(row.pin) : "" 
      })).reverse(); 
    } 
    
    else if (action === "createSurvey") {
      const sheet = getOrInitSheet(doc, "Surveys");
      const s = postData;
      // 強制 pin 為字串
      const pinStr = s.pin ? String(s.pin) : "";
      
      // 確保欄位順序: id, title, description, deadline, status, createdAt, pin
      const newRow = [s.id, s.title, s.description, s.deadline, s.status, s.createdAt, pinStr];
      sheet.appendRow(newRow);
      result = s;
    } 
    
    else if (action === "getResponses") {
      const sheet = getOrInitSheet(doc, "Responses");
      const data = getData(sheet);
      result = data.map(row => ({
        ...row,
        submittedAt: Number(row.submittedAt),
        securityMetadata: row.securityMetadata ? JSON.parse(row.securityMetadata) : {}
      }));
      
      if (e.parameter.surveyId) {
        result = result.filter(r => r.surveyId === e.parameter.surveyId);
      }
    }
    
    else if (action === "checkStudentStatus") {
       const sheet = getOrInitSheet(doc, "Responses");
       const data = getData(sheet);
       const studentId = e.parameter.studentId ? e.parameter.studentId.trim().toLowerCase() : "";
       
       result = data.filter(r => String(r.studentId).trim().toLowerCase() === studentId).map(row => ({
          ...row,
          submittedAt: Number(row.submittedAt),
          securityMetadata: {} 
       }));
    }

    else if (action === "saveResponse") {
      const sheet = getOrInitSheet(doc, "Responses");
      const r = postData;
      
      const data = getData(sheet);
      const isDuplicate = data.some(row => 
        row.surveyId === r.surveyId && 
        String(row.studentId).trim().toLowerCase() === String(r.studentId).trim().toLowerCase()
      );

      if (isDuplicate) {
        return ContentService
          .createTextOutput(JSON.stringify({ "status": "error", "message": "Duplicate submission" }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      const newRow = [
        r.id, 
        r.surveyId, 
        r.studentName, 
        r.studentId, 
        r.parentName, 
        r.signatureDataUrl, 
        r.comments, 
        r.submittedAt, 
        JSON.stringify(r.securityMetadata)
      ];
      sheet.appendRow(newRow);
      result = { status: "success" };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (e) {
    return ContentService
      .createTextOutput(JSON.stringify({ "status": "error", "error": e.toString() + " Stack: " + e.stack }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// 安全取得工作表，若不存在則建立，若表頭缺失則補全
function getOrInitSheet(doc, sheetName) {
  let sheet = doc.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = doc.insertSheet(sheetName);
    // 建立新表頭
    if (sheetName === "Surveys") {
      sheet.appendRow(["id", "title", "description", "deadline", "status", "createdAt", "pin"]);
    } else if (sheetName === "Responses") {
      sheet.appendRow(["id", "surveyId", "studentName", "studentId", "parentName", "signatureDataUrl", "comments", "submittedAt", "securityMetadata"]);
    }
    return sheet;
  }
  
  // Sheet 存在，檢查表頭是否需要遷移 (例如增加 pin 欄位)
  // 檢查 Surveys 表的 pin 欄位
  if (sheetName === "Surveys") {
    const lastCol = sheet.getLastColumn();
    if (lastCol > 0) {
       const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
       if (!headers.includes("pin")) {
         // 自動補上 pin 欄位
         sheet.getRange(1, lastCol + 1).setValue("pin");
       }
    } else {
       // 表格存在但是空的
       sheet.appendRow(["id", "title", "description", "deadline", "status", "createdAt", "pin"]);
    }
  }

  return sheet;
}

function getData(sheet) {
  if (!sheet) return [];
  
  const lastRow = sheet.getLastRow();
  // 如果只有標題列 (1行) 或完全沒資料 (0行)，回傳空陣列
  if (lastRow <= 1) {
    return [];
  }
  
  const dataRange = sheet.getDataRange();
  if (!dataRange) return []; // 防呆

  const rows = dataRange.getValues();
  const headers = rows[0];
  const data = [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      // 防止 row長度 < headers長度
      obj[headers[j]] = (j < row.length) ? row[j] : "";
    }
    data.push(obj);
  }
  return data;
}
