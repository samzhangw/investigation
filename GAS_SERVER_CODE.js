
// ==========================================
// 將此代碼複製到 Google Sheet > 擴充功能 > Apps Script
// 最後更新：新增 questions 與 answers 欄位支援自訂題目
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
      // 將 createdAt 轉回數字，並確保 pin 為字串，解析 questions JSON
      result = data.map(row => ({
        ...row,
        createdAt: Number(row.createdAt),
        pin: row.pin ? String(row.pin) : "",
        questions: row.questions ? JSON.parse(row.questions) : []
      })).reverse(); 
    } 
    
    else if (action === "createSurvey") {
      const sheet = getOrInitSheet(doc, "Surveys");
      const s = postData;
      // 強制 pin 為字串
      const pinStr = s.pin ? String(s.pin) : "";
      // 處理 questions 陣列轉 JSON 字串
      const questionsStr = s.questions ? JSON.stringify(s.questions) : "[]";
      
      // 確保欄位順序: id, title, description, deadline, status, createdAt, pin, questions
      const newRow = [s.id, s.title, s.description, s.deadline, s.status, s.createdAt, pinStr, questionsStr];
      sheet.appendRow(newRow);
      result = s;
    } 
    
    else if (action === "getResponses") {
      const sheet = getOrInitSheet(doc, "Responses");
      const data = getData(sheet);
      result = data.map(row => ({
        ...row,
        submittedAt: Number(row.submittedAt),
        securityMetadata: row.securityMetadata ? JSON.parse(row.securityMetadata) : {},
        answers: row.answers ? JSON.parse(row.answers) : {}
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
          securityMetadata: {},
          answers: row.answers ? JSON.parse(row.answers) : {}
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

      const answersStr = r.answers ? JSON.stringify(r.answers) : "{}";

      const newRow = [
        r.id, 
        r.surveyId, 
        r.studentName, 
        r.studentId, 
        r.parentName, 
        r.signatureDataUrl, 
        r.comments, 
        r.submittedAt, 
        JSON.stringify(r.securityMetadata),
        answersStr
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
      sheet.appendRow(["id", "title", "description", "deadline", "status", "createdAt", "pin", "questions"]);
    } else if (sheetName === "Responses") {
      sheet.appendRow(["id", "surveyId", "studentName", "studentId", "parentName", "signatureDataUrl", "comments", "submittedAt", "securityMetadata", "answers"]);
    }
    return sheet;
  }
  
  // Sheet 存在，檢查表頭是否需要遷移
  const lastCol = sheet.getLastColumn();
  if (lastCol > 0) {
     const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
     
     if (sheetName === "Surveys") {
       if (!headers.includes("pin")) sheet.getRange(1, lastCol + 1).setValue("pin");
       // 重新抓取 lastCol 因為可能剛加了 pin
       const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
       if (!currentHeaders.includes("questions")) sheet.getRange(1, sheet.getLastColumn() + 1).setValue("questions");
     }
     
     if (sheetName === "Responses") {
       if (!headers.includes("answers")) sheet.getRange(1, lastCol + 1).setValue("answers");
     }
  } else {
     // 表格存在但是空的
     if (sheetName === "Surveys") {
       sheet.appendRow(["id", "title", "description", "deadline", "status", "createdAt", "pin", "questions"]);
     } else if (sheetName === "Responses") {
        sheet.appendRow(["id", "surveyId", "studentName", "studentId", "parentName", "signatureDataUrl", "comments", "submittedAt", "securityMetadata", "answers"]);
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
