
// ==========================================
// 將此代碼複製到 Google Sheet > 擴充功能 > Apps Script
// 最後更新：新增 studentClass (班級) 欄位與自動修復
// ==========================================

const SCRIPT_PROP = PropertiesService.getScriptProperties();

function setup() {
  const doc = SpreadsheetApp.getActiveSpreadsheet();
  getOrInitSheet(doc, "Surveys");
  getOrInitSheet(doc, "Responses");
  getOrInitSheet(doc, "SystemLogs");
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
      
      // 確保欄位順序: id, title, description, deadline, status, createdAt, pin, questions, startTime
      // 注意：startTime 是後來加的，為了相容性，我們確保表頭存在
      
      const newRow = [
        s.id, 
        s.title, 
        s.description, 
        s.deadline, 
        s.status, 
        s.createdAt, 
        pinStr, 
        questionsStr,
        s.startTime || ""
      ];
      sheet.appendRow(newRow);
      
      logSystemAction(doc, "建立調查", "Admin", `${s.title} (ID: ${s.id})`);
      result = s;
    } 

    else if (action === "updateSurvey") {
      const sheet = getOrInitSheet(doc, "Surveys");
      const s = postData;
      const data = getData(sheet);
      
      // Find row index (data is 0-indexed, but sheet rows are 1-indexed + 1 header row)
      // We iterate data array to find index
      let rowIndex = -1;
      for (let i = 0; i < data.length; i++) {
        if (String(data[i].id) === String(s.id)) {
          rowIndex = i + 2; // +1 for header, +1 because sheet rows start at 1
          break;
        }
      }

      if (rowIndex === -1) {
        throw new Error("Survey ID not found");
      }

      // Update specific columns. We assume header order:
      // ["id", "title", "description", "deadline", "status", "createdAt", "pin", "questions", "startTime"]
      // Map keys to column index (1-based)
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      
      const updateCell = (colName, value) => {
        const colIdx = headers.indexOf(colName);
        if (colIdx !== -1) {
          sheet.getRange(rowIndex, colIdx + 1).setValue(value);
        }
      };

      updateCell("title", s.title);
      updateCell("description", s.description);
      updateCell("deadline", s.deadline);
      updateCell("questions", s.questions ? JSON.stringify(s.questions) : "[]");
      updateCell("startTime", s.startTime || "");

      logSystemAction(doc, "更新調查", "Admin", `${s.title} (ID: ${s.id})`);
      result = { status: "success" };
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

      // 欄位順序: id, surveyId, studentName, studentId, studentClass, parentName, signatureDataUrl, comments, submittedAt, securityMetadata, answers
      const newRow = [
        r.id, 
        r.surveyId, 
        r.studentName, 
        r.studentId, 
        r.studentClass || "", // New Field
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

    // --- Announcement Actions ---
    else if (action === "getAnnouncement") {
        const props = PropertiesService.getScriptProperties();
        result = {
            title: props.getProperty("ANN_TITLE") || "",
            content: props.getProperty("ANN_CONTENT") || "",
            isActive: props.getProperty("ANN_ACTIVE") === "true",
            updatedAt: props.getProperty("ANN_DATE") || ""
        };
    }
    
    else if (action === "saveAnnouncement") {
        const props = PropertiesService.getScriptProperties();
        const data = postData;
        
        props.setProperty("ANN_TITLE", data.title);
        props.setProperty("ANN_CONTENT", data.content);
        props.setProperty("ANN_ACTIVE", String(data.isActive));
        props.setProperty("ANN_DATE", String(Date.now()));
        
        logSystemAction(doc, "發布公告", "Admin", `${data.title} (${data.isActive ? '啟用' : '停用'})`);
        result = { status: "success" };
    }

    // --- System Logs ---
    else if (action === "logAction") {
        const data = postData;
        logSystemAction(doc, data.action, data.user, data.details);
        result = { status: "success" };
    }

    else if (action === "getSystemLogs") {
        const sheet = getOrInitSheet(doc, "SystemLogs");
        const data = getData(sheet);
        // Get last 50 logs
        result = data.slice(-50).reverse();
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

function logSystemAction(doc, action, user, details) {
    try {
        const sheet = getOrInitSheet(doc, "SystemLogs");
        sheet.appendRow([new Date().toISOString(), action, user, details]);
    } catch(e) {
        // Log failure shouldn't stop app
        Logger.log("Log failed: " + e);
    }
}

// 安全取得工作表，若不存在則建立，若表頭缺失則補全
function getOrInitSheet(doc, sheetName) {
  let sheet = doc.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = doc.insertSheet(sheetName);
    // 建立新表頭
    if (sheetName === "Surveys") {
      sheet.appendRow(["id", "title", "description", "deadline", "status", "createdAt", "pin", "questions", "startTime"]);
    } else if (sheetName === "Responses") {
      sheet.appendRow(["id", "surveyId", "studentName", "studentId", "studentClass", "parentName", "signatureDataUrl", "comments", "submittedAt", "securityMetadata", "answers"]);
    } else if (sheetName === "SystemLogs") {
      sheet.appendRow(["timestamp", "action", "user", "details"]);
    }
    return sheet;
  }
  
  // Sheet 存在，檢查表頭是否需要遷移
  const lastCol = sheet.getLastColumn();
  if (lastCol > 0) {
     const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
     
     if (sheetName === "Surveys") {
       if (!headers.includes("pin")) sheet.getRange(1, lastCol + 1).setValue("pin");
       // 重新抓取 lastCol
       const h2 = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
       if (!h2.includes("questions")) sheet.getRange(1, sheet.getLastColumn() + 1).setValue("questions");
       
       const h3 = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
       if (!h3.includes("startTime")) sheet.getRange(1, sheet.getLastColumn() + 1).setValue("startTime");
     }
     
     if (sheetName === "Responses") {
       // Check for answers
       if (!headers.includes("answers")) {
         sheet.getRange(1, sheet.getLastColumn() + 1).setValue("answers");
       }
       // Check for studentClass
       const updatedHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
       if (!updatedHeaders.includes("studentClass")) {
           sheet.getRange(1, sheet.getLastColumn() + 1).setValue("studentClass");
       }
     }
  } else {
     // 表格存在但是空的
     if (sheetName === "Surveys") {
       sheet.appendRow(["id", "title", "description", "deadline", "status", "createdAt", "pin", "questions", "startTime"]);
     } else if (sheetName === "Responses") {
        sheet.appendRow(["id", "surveyId", "studentName", "studentId", "studentClass", "parentName", "signatureDataUrl", "comments", "submittedAt", "securityMetadata", "answers"]);
     } else if (sheetName === "SystemLogs") {
        sheet.appendRow(["timestamp", "action", "user", "details"]);
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
