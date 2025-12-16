// 교사 모니터링 페이지 접근 제어 및 데이터 관리
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, orderBy, doc, deleteDoc, updateDoc, getDoc, increment } from 'firebase/firestore';
import { firebaseConfig, adminUids, isFirebaseConfigValid } from './firebaseConfig.js';

// ChatGPT API Key
const CHATGPT_API_KEY = import.meta.env.VITE_CHATGPT_API_KEY;
const CHATGPT_API_URL = 'https://api.openai.com/v1/chat/completions';

// Firebase 초기화
let app;
let auth;
let db;

if (!isFirebaseConfigValid()) {
  console.error('Firebase 설정이 완전하지 않습니다.');
  showError('Firebase 설정에 오류가 있습니다.');
} else {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    
    // 인증 상태 확인
    onAuthStateChanged(auth, (user) => {
      if (user) {
        const uid = user.uid;
        const isAdminUser = isAdmin(uid);
        
        if (isAdminUser) {
          // 관리자인 경우 페이지 표시
          document.getElementById('admin-content').style.display = 'block';
          document.getElementById('access-denied').style.display = 'none';
          
          // URL 파라미터에서 noteId 확인 (studentDetail.html에서 리다이렉트된 경우)
          const urlParams = new URLSearchParams(window.location.search);
          const noteIdFromUrl = urlParams.get('noteId');
          
          // 초기화 함수 호출
          initializeTeacherMonitoring().then(() => {
            // noteId가 URL에 있으면 피드백 창 열기
            if (noteIdFromUrl) {
              setTimeout(() => {
                openFeedbackWindow(noteIdFromUrl);
                // URL에서 noteId 제거
                window.history.replaceState({}, document.title, window.location.pathname);
              }, 500);
            }
          });
        } else {
          // 관리자가 아닌 경우 접근 거부
          document.getElementById('admin-content').style.display = 'none';
          document.getElementById('access-denied').style.display = 'block';
        }
      } else {
        // 로그인되지 않은 경우 메인으로 리다이렉트
        window.location.href = 'index.html';
      }
    });
  } catch (error) {
    console.error('Firebase 초기화 실패:', error);
    showError('Firebase 초기화에 실패했습니다.');
  }
}

// 관리자 여부 확인
function isAdmin(uid) {
  if (!uid || adminUids.length === 0) {
    return false;
  }
  return adminUids.includes(uid);
}

// 에러 표시
function showError(message) {
  document.getElementById('access-denied').style.display = 'block';
  document.getElementById('access-denied').innerHTML = `
    <div class="error-message">
      <h2>⚠️ 오류</h2>
      <p>${message}</p>
      <button onclick="window.location.href='index.html'" class="btn btn-login">메인으로 돌아가기</button>
    </div>
  `;
}

// 테스트 모드 데이터 필터링 (관리자가 작성한 데이터 제외)
function isTestModeData(note) {
  // userId가 adminUids에 포함되어 있으면 테스트 모드 데이터
  return note.userId && adminUids.includes(note.userId);
}

// 교사 모니터링 초기화
async function initializeTeacherMonitoring() {
  return new Promise(async (resolve, reject) => {
    if (!db) {
      console.error('Firebase가 초기화되지 않았습니다.');
      reject(new Error('Firebase가 초기화되지 않았습니다.'));
      return;
    }
    
    try {
    console.log('학생 일기 데이터 로딩 시작...');
    
    // 모든 학생 일기 데이터 가져오기 (orderBy 없이 가져온 후 클라이언트에서 정렬)
    const notesCollection = collection(db, 'studentNotes');
    const querySnapshot = await getDocs(notesCollection);
    
    console.log('Firestore에서 가져온 문서 수:', querySnapshot.size);
    
    const allNotes = [];
    querySnapshot.forEach((docSnapshot) => {
      try {
        const noteData = docSnapshot.data();
        
        // 데이터 유효성 검사
        if (!noteData) {
          console.warn('데이터가 없는 문서:', docSnapshot.id);
          return;
        }
        
        // 테스트 모드 데이터 제외
        if (isTestModeData(noteData)) {
          console.log('테스트 모드 데이터 제외:', docSnapshot.id);
          return;
        }
        
        allNotes.push({
          id: docSnapshot.id,
          data: noteData
        });
      } catch (error) {
        console.error('문서 처리 중 오류:', docSnapshot.id, error);
      }
    });
    
    console.log('필터링된 노트 수:', allNotes.length);
    
    // timestamp 기준으로 정렬 (최신순)
    allNotes.sort((a, b) => {
      const timestampA = a.data.timestamp ? new Date(a.data.timestamp).getTime() : 0;
      const timestampB = b.data.timestamp ? new Date(b.data.timestamp).getTime() : 0;
      return timestampB - timestampA;
    });
    
    // 사용자 정보 가져오기 (users 컬렉션)
    console.log('사용자 정보 로딩 시작...');
    const usersCollection = collection(db, 'users');
    const usersSnapshot = await getDocs(usersCollection);
    const usersMap = new Map();
    
    usersSnapshot.forEach((docSnapshot) => {
      try {
        const userData = docSnapshot.data();
        if (userData) {
          usersMap.set(docSnapshot.id, userData);
        }
      } catch (error) {
        console.error('사용자 정보 처리 중 오류:', docSnapshot.id, error);
      }
    });
    
    console.log('사용자 정보 로딩 완료:', usersMap.size, '명');
    
    // 전역 변수에 저장 (다른 함수에서도 사용할 수 있도록)
    window.usersMap = usersMap;
    
    // 노트에 사용자 정보 추가
    allNotes.forEach(({ data: note }) => {
      if (note.userId && usersMap.has(note.userId)) {
        const userData = usersMap.get(note.userId);
        note.userInfo = userData;
      }
    });
    
    // 날짜별로 그룹화
    const datesMap = new Map();
    allNotes.forEach(({ id, data: note }) => {
      try {
        // activityYear, activityMonth, activityDay가 문자열일 수 있으므로 처리
        const year = String(note.activityYear || '').trim();
        const month = String(note.activityMonth || '').trim();
        const day = String(note.activityDay || '').trim();
        
        // 빈 문자열 체크 및 유효성 검사
        if (!year || !month || !day) {
          console.warn('날짜 정보가 불완전한 노트:', id, { year, month, day });
          return;
        }
        
        // 숫자로 변환 가능한지 확인
        const yearNum = parseInt(year);
        const monthNum = parseInt(month);
        const dayNum = parseInt(day);
        
        if (isNaN(yearNum) || isNaN(monthNum) || isNaN(dayNum)) {
          console.warn('날짜 정보가 숫자가 아닌 노트:', id, { year, month, day });
          return;
        }
        
        // 유효한 날짜 범위 확인
        if (yearNum < 2000 || yearNum > 2100 || monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
          console.warn('날짜 범위가 유효하지 않은 노트:', id, { yearNum, monthNum, dayNum });
          return;
        }
        
        const dateKey = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
        if (!datesMap.has(dateKey)) {
          datesMap.set(dateKey, []);
        }
        datesMap.get(dateKey).push({ id, note });
      } catch (error) {
        console.error('날짜 그룹화 중 오류:', id, error);
      }
    });
    
    console.log('날짜별 그룹화 완료:', datesMap.size, '개 날짜');
    console.log('날짜 키 목록:', Array.from(datesMap.keys()));
    
    if (allNotes.length === 0) {
      console.warn('학생 일기 데이터가 없습니다.');
      // 모든 탭에 빈 상태 메시지 표시
      const dateFilterList = document.getElementById('date-filter-list');
      if (dateFilterList) {
        dateFilterList.innerHTML = '<p class="empty-text">아직 작성된 일기가 없습니다.</p>';
      }
      
      const classFilterList = document.getElementById('class-filter-list');
      if (classFilterList) {
        classFilterList.innerHTML = '<p class="empty-text">반 정보가 없습니다.</p>';
      }
      
      const unreviewedList = document.getElementById('unreviewed-list');
      if (unreviewedList) {
        unreviewedList.innerHTML = '<p class="empty-text">확인하지 않은 일기가 없습니다.</p>';
      }
      
      // 전역 변수 초기화
      window.allNotesData = [];
      window.datesMap = new Map();
      resolve();
      return;
    }
    
    // 날짜 목록 정렬 (최신순)
    const sortedDates = Array.from(datesMap.keys()).sort((a, b) => {
      // YYYY-MM-DD 형식의 문자열을 직접 비교
      return b.localeCompare(a);
    });
    
    // 날짜 필터 목록 표시
    if (sortedDates.length > 0) {
      displayDateFilterList(sortedDates, datesMap);
    } else {
      const dateFilterList = document.getElementById('date-filter-list');
      if (dateFilterList) {
        dateFilterList.innerHTML = '<p class="empty-text">날짜 정보가 있는 일기가 없습니다.</p>';
      }
    }
    
    // 전역 변수에 저장
    window.allNotesData = allNotes;
    window.datesMap = datesMap;
    
    console.log('전역 변수 저장 완료. allNotesData:', allNotes.length, '개');
    
    // 반별관리 탭 초기화
    try {
      initializeClassManagement(allNotes, usersMap);
    } catch (error) {
      console.error('반별관리 탭 초기화 실패:', error);
    }
    
    // 확인하지 않은 일기 탭 초기화
    try {
      initializeUnreviewedNotes(allNotes);
    } catch (error) {
      console.error('확인하지 않은 일기 탭 초기화 실패:', error);
    }
    
    // 토큰 랭킹 탭 초기화
    try {
      initializeTokenRanking(usersMap);
    } catch (error) {
      console.error('토큰 랭킹 탭 초기화 실패:', error);
    }
    
    console.log('교사 모니터링 초기화 완료');
    resolve();
    
  } catch (error) {
    console.error('데이터 로드 실패:', error);
    console.error('에러 상세:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      name: error.name
    });
    
    const errorMessage = error.message || '알 수 없는 오류';
    
    // 모든 탭에 에러 메시지 표시
    const dateFilterList = document.getElementById('date-filter-list');
    if (dateFilterList) {
      dateFilterList.innerHTML = `
        <p class="error-text">데이터를 불러오는 중 오류가 발생했습니다.<br>${errorMessage}</p>
      `;
    }
    
    const classFilterList = document.getElementById('class-filter-list');
    if (classFilterList) {
      classFilterList.innerHTML = `
        <p class="error-text">데이터를 불러오는 중 오류가 발생했습니다.<br>${errorMessage}</p>
      `;
    }
    
    const unreviewedList = document.getElementById('unreviewed-list');
    if (unreviewedList) {
      unreviewedList.innerHTML = `
        <p class="error-text">데이터를 불러오는 중 오류가 발생했습니다.<br>${errorMessage}</p>
      `;
    }
    
    // 전역 변수 초기화
    window.allNotesData = [];
    window.datesMap = new Map();
    reject(error);
  }
  });
}

// 탭 전환 함수
window.switchTab = function(tabName) {
  // 모든 탭 버튼 비활성화
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // 모든 탭 콘텐츠 숨기기
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  // 선택한 탭 활성화
  const selectedBtn = document.querySelector(`[data-tab="${tabName}"]`);
  const selectedContent = document.getElementById(`${tabName}-tab`);
  
  if (selectedBtn) {
    selectedBtn.classList.add('active');
  }
  if (selectedContent) {
    selectedContent.classList.add('active');
  }
}

// 날짜 필터 목록 표시 (날짜별 확인 탭용)
function displayDateFilterList(dates, datesMap) {
  const dateFilterList = document.getElementById('date-filter-list');
  if (!dateFilterList) return;
  
  if (dates.length === 0) {
    dateFilterList.innerHTML = '<p class="empty-text">아직 작성된 일기가 없습니다.</p>';
    return;
  }
  
  let html = '<div class="date-list-items">';
  dates.forEach(dateKey => {
    const notes = datesMap.get(dateKey);
    if (!notes || notes.length === 0) {
      return;
    }
    
    // 날짜 키 파싱 (YYYY-MM-DD 형식)
    const dateParts = dateKey.split('-');
    if (dateParts.length !== 3) {
      return;
    }
    
    const year = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]);
    const day = parseInt(dateParts[2]);
    
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      return;
    }
    
    // Date 객체 생성 (월은 0부터 시작하므로 -1)
    const date = new Date(year, month - 1, day);
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const weekday = weekdays[date.getDay()];
    const count = notes.length;
    
    html += `
      <div class="date-list-item" data-date="${dateKey}" onclick="selectDateForFilter('${dateKey}')">
        <div class="date-item-content">
          <span class="date-item-text">${year}년 ${month}월 ${day}일 (${weekday})</span>
          <span class="date-item-count">${count}개</span>
        </div>
      </div>
    `;
  });
  html += '</div>';
  
  dateFilterList.innerHTML = html;
}

// 날짜 선택 처리 (날짜별 확인 탭용)
window.selectDateForFilter = function(dateKey) {
  console.log('날짜 선택됨:', dateKey);
  
  if (!window.datesMap) {
    console.error('datesMap이 초기화되지 않았습니다.');
    alert('데이터를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
    return;
  }
  
  const notes = window.datesMap.get(dateKey);
  console.log('선택된 날짜의 노트:', notes);
  console.log('노트 개수:', notes ? notes.length : 0);
  
  if (!notes || notes.length === 0) {
    const container = document.getElementById('date-students-list');
    if (container) {
      container.innerHTML = '<p class="empty-message">선택한 날짜에 작성된 일기가 없습니다.</p>';
    }
    return;
  }
  
  // 날짜 키 파싱
  const dateParts = dateKey.split('-');
  if (dateParts.length !== 3) {
    console.error('잘못된 날짜 형식:', dateKey);
    return;
  }
  
  const year = parseInt(dateParts[0]);
  const month = parseInt(dateParts[1]);
  const day = parseInt(dateParts[2]);
  
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    console.error('날짜 파싱 실패:', dateKey);
    return;
  }
  
  const date = new Date(year, month - 1, day);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const weekday = weekdays[date.getDay()];
  
  // 제목 업데이트
  const titleElement = document.getElementById('selected-date-title');
  if (titleElement) {
    titleElement.textContent = `${year}년 ${month}월 ${day}일 (${weekday})`;
  } else {
    console.error('selected-date-title 요소를 찾을 수 없습니다.');
  }
  
  // 선택된 날짜 스타일 업데이트
  document.querySelectorAll('.date-list-item').forEach(item => {
    item.classList.remove('active');
    if (item.getAttribute('data-date') === dateKey) {
      item.classList.add('active');
    }
  });
  
  // 학생 목록 표시
  console.log('학생 목록 표시 시작');
  displayDateStudentsList(notes);
};

// 날짜별 학생 목록 표시
function displayDateStudentsList(notes) {
  console.log('displayDateStudentsList 호출됨, notes:', notes);
  
  const container = document.getElementById('date-students-list');
  if (!container) {
    console.error('date-students-list 요소를 찾을 수 없습니다.');
    return;
  }
  
  if (!notes || notes.length === 0) {
    container.innerHTML = '<p class="empty-message">선택한 날짜에 작성된 일기가 없습니다.</p>';
    return;
  }
  
  // 학생별로 그룹화 (같은 학생이 여러 일기를 작성한 경우)
  const studentsMap = new Map();
  
  notes.forEach((noteItem) => {
    // datesMap에는 { id, note } 형식으로 저장되어 있음
    let id, note;
    if (noteItem.id && noteItem.note) {
      // datesMap에서 가져온 형식: { id, note }
      id = noteItem.id;
      note = noteItem.note;
    } else if (noteItem.id && noteItem.data) {
      // 다른 곳에서 가져온 형식: { id, data: note }
      id = noteItem.id;
      note = noteItem.data;
    } else {
      // 이미 note 객체인 경우
      id = noteItem.id || '';
      note = noteItem;
    }
    
    console.log('처리 중인 노트:', { id, note, hasUserId: !!note?.userId });
    
    const userId = note?.userId;
    if (!userId) {
      console.warn('userId가 없는 노트:', { id, note });
      return;
    }
    
    const userInfo = note.userInfo || {};
    // usersMap에서 최신 사용자 정보 가져오기 (개인정보 수정 반영)
    const latestUserInfo = window.usersMap?.get(userId) || userInfo;
    const studentName = latestUserInfo.name || note.userName || '이름 없음';
    
    // 최신 사용자 정보에서 학년, 반, 번호 정보 가져오기
    const grade = latestUserInfo.grade || userInfo.grade || '';
    const classNum = latestUserInfo.classNum || userInfo.classNum || '';
    const number = latestUserInfo.number || userInfo.number || '';
    
    let className = '반 정보 없음';
    if (grade && classNum) {
      className = `${grade}학년 ${classNum}반`;
    }
    
    const studentNumber = number || '번호 없음';
    const studentId = latestUserInfo.studentId || userInfo.studentId || note.userStudentId || '';
    
    console.log('학생 정보:', { userId, studentName, className, studentNumber, studentId });
    
    if (!studentsMap.has(userId)) {
      studentsMap.set(userId, {
        userId: userId,
        name: studentName,
        className: className,
        number: studentNumber,
        studentId: studentId,
        notes: []
      });
    } else {
      // 이미 존재하는 학생의 경우 최신 정보로 업데이트
      const existingStudent = studentsMap.get(userId);
      existingStudent.name = studentName;
      existingStudent.className = className;
      existingStudent.number = studentNumber;
      existingStudent.studentId = studentId;
    }
    
    studentsMap.get(userId).notes.push({ id, note });
  });
  
  console.log('그룹화된 학생 수:', studentsMap.size);
  
  // 학생 목록을 반, 번호 순으로 정렬
  const students = Array.from(studentsMap.values()).sort((a, b) => {
    // 반 비교
    const classCompare = a.className.localeCompare(b.className);
    if (classCompare !== 0) return classCompare;
    
    // 번호 비교
    const numA = parseInt(a.number) || 999;
    const numB = parseInt(b.number) || 999;
    return numA - numB;
  });
  
  if (students.length === 0) {
    container.innerHTML = '<p class="empty-message">학생 정보를 찾을 수 없습니다.</p>';
    return;
  }
  
  let html = '<div class="date-students-grid">';
  students.forEach(student => {
    const notesCount = student.notes.length;
    // 가장 최근 일기 가져오기
    const latestNote = student.notes.sort((a, b) => {
      // datesMap 형식: { id, note }
      const noteA = a.note || a.data || a;
      const noteB = b.note || b.data || b;
      const dateA = new Date(noteA.timestamp || 0);
      const dateB = new Date(noteB.timestamp || 0);
      return dateB - dateA;
    })[0];
    
    // datesMap 형식: { id, note }
    const noteData = latestNote.note || latestNote.data || latestNote;
    const noteId = latestNote.id || '';
    const emotion = noteData?.emotion || '😊';
    const hasFeedback = noteData?.feedback && noteData.feedback.trim().length > 0;
    const feedbackBadge = hasFeedback ? '<span class="feedback-badge-small">💬</span>' : '';
    
    if (!noteId) {
      console.warn('noteId가 없는 노트:', latestNote);
      return;
    }
    
    html += `
      <div class="date-student-item" onclick="openFeedbackWindow('${noteId}')">
        <div class="date-student-header">
          <span class="date-student-emotion">${emotion}</span>
          <div class="date-student-info">
            <span class="date-student-name">${student.name}</span>
            <span class="date-student-class">${student.className} ${student.number}번</span>
            ${student.studentId ? `<span class="date-student-id">(${student.studentId})</span>` : ''}
          </div>
          ${feedbackBadge}
        </div>
        <div class="date-student-meta">
          <span class="date-student-count">일기 ${notesCount}개</span>
        </div>
      </div>
    `;
  });
  html += '</div>';
  
  console.log('학생 목록 HTML 생성 완료, 학생 수:', students.length);
  container.innerHTML = html;
}

// 노트 상세 보기 모달 열기
window.openNoteDetailModal = async function(noteId) {
  if (!window.allNotesData) return;
  
  const noteData = window.allNotesData.find(item => item.id === noteId);
  if (!noteData) {
    alert('노트를 찾을 수 없습니다.');
    return;
  }
  
  const note = noteData.data || noteData;
  
  // 문제 내용 생성
  let problemContentHTML = '';
  if (note.problemData) {
    if (note.problemData.type === 'photo' && note.problemData.imageURL) {
      problemContentHTML = `
        <div class="form-group">
          <label>문제 이미지</label>
          <div class="detail-image-container">
            <img src="${note.problemData.imageURL}" alt="문제 이미지" class="detail-image-preview" 
                 onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'200\\' height=\\'200\\'%3E%3Crect fill=\\'%23f5f5f5\\' width=\\'200\\' height=\\'200\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' text-anchor=\\'middle\\' dy=\\'.3em\\' fill=\\'%23999\\' font-family=\\'sans-serif\\' font-size=\\'14\\'%3E이미지를 불러올 수 없습니다%3C/text%3E%3C/svg%3E';" />
          </div>
        </div>
      `;
    } else if (note.problemData.type === 'text' && note.problemData.content) {
      problemContentHTML = `
        <div class="form-group">
          <label>문제 텍스트</label>
          <div class="detail-text-content">${note.problemData.content.replace(/\n/g, '<br>')}</div>
        </div>
      `;
    } else if (note.problemData.type === 'draw' && note.problemData.imageURL) {
      problemContentHTML = `
        <div class="form-group">
          <label>그린 문제</label>
          <div class="detail-image-container">
            <img src="${note.problemData.imageURL}" alt="그린 문제" class="detail-image-preview" 
                 onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'200\\' height=\\'200\\'%3E%3Crect fill=\\'%23f5f5f5\\' width=\\'200\\' height=\\'200\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' text-anchor=\\'middle\\' dy=\\'.3em\\' fill=\\'%23999\\' font-family=\\'sans-serif\\' font-size=\\'14\\'%3E이미지를 불러올 수 없습니다%3C/text%3E%3C/svg%3E';" />
          </div>
        </div>
      `;
    } else if (note.problemData.type === 'draw' && !note.problemData.imageURL) {
      problemContentHTML = `
        <div class="form-group">
          <label>문제</label>
          <div class="detail-text-content">그림이 저장되지 않았습니다.</div>
        </div>
      `;
    }
  }
  
  // 챗봇 대화 내역 생성
  let chatHistoryHTML = '';
  if (note.chatHistory && Array.isArray(note.chatHistory) && note.chatHistory.length > 0) {
    chatHistoryHTML = `
      <div class="form-group">
        <label>챗봇과의 대화</label>
        <div class="detail-chat-history">
          ${note.chatHistory.map((msg, index) => {
            const role = msg.role === 'user' ? '학생' : '선생님';
            const roleClass = msg.role === 'user' ? 'chat-user' : 'chat-assistant';
            return `
              <div class="chat-message ${roleClass}">
                <span class="chat-role">${role}:</span>
                <span class="chat-content">${msg.content.replace(/\n/g, '<br>')}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }
  
  // 피드백 섹션 생성
  const currentFeedback = note.feedback || '';
  const hasFeedback = currentFeedback.trim().length > 0;
  const hasReceivedPieToken = note.receivedPieToken === true;
  
  const feedbackHTML = `
    <div class="form-group feedback-section">
      <label>교사 피드백</label>
      ${hasFeedback ? `
        <div class="existing-feedback">
          <div class="detail-text-content">${currentFeedback.replace(/\n/g, '<br>')}</div>
          ${hasReceivedPieToken ? '<div class="pie-token-indicator">🥧 파이 토큰 지급됨</div>' : ''}
        </div>
      ` : ''}
      <div class="feedback-input-section">
        <div class="feedback-input-header">
          <button id="suggest-feedback-btn" class="btn-suggest-feedback" onclick="suggestFeedback('${noteId}')">
            💡 피드백 추천받기
          </button>
        </div>
        <textarea 
          id="feedback-textarea-${noteId}" 
          class="feedback-textarea" 
          placeholder="학생에게 피드백을 작성해주세요..."
          rows="5"
        >${currentFeedback}</textarea>
        <div class="feedback-actions">
          <button class="btn-save-feedback" onclick="saveFeedback('${noteId}')">
            💾 피드백 저장
          </button>
          ${hasReceivedPieToken ? '' : '<span class="pie-token-hint">💡 피드백 저장 시 파이 토큰 1개가 지급됩니다</span>'}
        </div>
      </div>
    </div>
  `;
  
  // 모달 HTML 생성
  const modalHTML = `
    <div id="teacher-note-detail-modal" class="modal">
      <div class="modal-content modal-content-large">
        <div class="modal-header">
          <h2>📝 학생 일기 상세보기</h2>
          <button class="modal-close" onclick="closeTeacherNoteModal()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>학생 정보</label>
            <div class="detail-info">
              <p><strong>이름:</strong> ${note.userName || note.userInfo?.name || '이름 없음'}</p>
              <p><strong>이메일:</strong> ${note.userEmail || ''}</p>
              ${note.userStudentId || note.userInfo?.studentId ? `<p><strong>학번:</strong> ${note.userStudentId || note.userInfo?.studentId}</p>` : ''}
              ${note.userInfo?.grade ? `<p><strong>학년:</strong> ${note.userInfo.grade}학년 ${note.userInfo.classNum}반 ${note.userInfo.number}번</p>` : ''}
            </div>
          </div>
          <div class="form-group">
            <label>날짜 및 시간</label>
            <div class="detail-info">${note.activityDate} ${note.activityTime}</div>
          </div>
          <div class="form-group">
            <label>오늘의 감정</label>
            <div class="detail-emotion">
              <span class="detail-emotion-icon">${note.emotion || '😊'}</span>
            </div>
          </div>
          ${chatHistoryHTML}
          ${note.diaryContent ? `
            <div class="form-group">
              <label>일기 내용</label>
              <div class="detail-text-content">${note.diaryContent.replace(/\n/g, '<br>')}</div>
            </div>
          ` : ''}
          ${problemContentHTML}
          ${note.problemExplanation ? `
            <div class="form-group">
              <label>문제 설명</label>
              <div class="detail-text-content">${note.problemExplanation.replace(/\n/g, '<br>')}</div>
            </div>
          ` : ''}
          ${feedbackHTML}
        </div>
        <div class="modal-footer">
          <button class="btn btn-cancel" onclick="closeTeacherNoteModal()">닫기</button>
        </div>
      </div>
    </div>
  `;
  
  // 기존 모달 제거
  const existingModal = document.getElementById('teacher-note-detail-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // 모달 추가
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // 모달 외부 클릭 시 닫기
  const modal = document.getElementById('teacher-note-detail-modal');
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        closeTeacherNoteModal();
      }
    });
    
    // ESC 키로 닫기
    const escapeHandler = function(e) {
      if (e.key === 'Escape') {
        closeTeacherNoteModal();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);
  }
  
  // 스크롤 방지
  document.body.style.overflow = 'hidden';
};

// 피드백 추천 받기 (챗봇 기능)
window.suggestFeedback = async function(noteId) {
  const noteData = window.allNotesData.find(item => item.id === noteId);
  if (!noteData) return;
  
  const note = noteData.data || noteData;
  const btn = document.getElementById('suggest-feedback-btn');
  const originalText = btn.textContent;
  
  btn.disabled = true;
  btn.textContent = '💭 추천 중...';
  
  try {
    if (!CHATGPT_API_KEY) {
      alert('ChatGPT API Key가 설정되지 않았습니다.');
      return;
    }
    
    // 일기 내용을 기반으로 피드백 추천 요청
    const diaryContent = note.diaryContent || '일기 내용이 없습니다.';
    const emotion = note.emotion || '😊';
    const problemExplanation = note.problemExplanation || '';
    
    const prompt = `당신은 친근하고 따뜻한 고등학교 수학교사야. 학생이 작성한 수학 감정 일기를 읽고 친근하고 격려하는 피드백을 작성해줘.

중요: 반드시 반말로 작성해야 해. 존댓말은 절대 사용하지 마.

학생의 감정: ${emotion}
일기 내용: ${diaryContent}
${problemExplanation ? `문제 설명: ${problemExplanation}` : ''}

피드백 작성 시 주의사항:
- 친근하고 자연스러운 반말 톤으로 작성 ("~하자", "~해보자", "~해", "~야", "~구나", "~지" 등)
- 절대 존댓말을 사용하지 말고, 항상 반말로 친근하게 작성해
- 학생의 노력을 인정하고 칭찬해 ("정말 잘했어!", "고생했어!", "훌륭해!" 등)
- 구체적이고 건설적인 조언 제공해
- 학생의 감정을 공감하고 이해해
- 수학 공부에 대한 동기 부여해
- 200자 이내로 간결하게 작성해
- 이모티콘을 적절히 사용해서 따뜻함을 전달해`;

    const response = await fetch(CHATGPT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CHATGPT_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: '당신은 친근하고 따뜻한 고등학교 수학교사야. 학생의 일기를 읽고 친근한 반말 톤으로 격려하는 피드백을 작성해. 반드시 반말로만 작성해야 하고, 존댓말은 절대 사용하지 마. "~하자", "~해보자", "~해", "~야", "~구나", "~지" 같은 친근하고 자연스러운 반말 말투를 사용하고, 이모티콘도 적절히 사용해서 따뜻함을 전달해.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 300,
        temperature: 0.7
      })
    });
    
    if (!response.ok) {
      throw new Error('API 요청 실패');
    }
    
    const data = await response.json();
    const suggestedFeedback = data.choices[0].message.content.trim();
    
    // 텍스트 영역에 추천 피드백 입력
    const textarea = document.getElementById(`feedback-textarea-${noteId}`);
    if (textarea) {
      textarea.value = suggestedFeedback;
      textarea.focus();
    }
    
  } catch (error) {
    console.error('피드백 추천 실패:', error);
    alert('피드백 추천 중 오류가 발생했습니다. 다시 시도해주세요.');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
};

// 피드백 저장
window.saveFeedback = async function(noteId) {
  const textarea = document.getElementById(`feedback-textarea-${noteId}`);
  if (!textarea) {
    alert('피드백 입력 칸을 찾을 수 없습니다.');
    return;
  }
  
  const feedback = textarea.value.trim();
  if (!feedback) {
    alert('피드백을 입력해주세요.');
    return;
  }
  
  if (!db) {
    alert('Firebase가 초기화되지 않았습니다.');
    return;
  }
  
  try {
    const noteData = window.allNotesData.find(item => item.id === noteId);
    if (!noteData) {
      alert('노트를 찾을 수 없습니다.');
      return;
    }
    
    const note = noteData.data || noteData;
    const userId = note.userId;
    
    if (!userId) {
      alert('사용자 ID를 찾을 수 없습니다.');
      return;
    }
    
    // 토큰 지급 여부 확인
    const tokenCheckbox = document.getElementById(`give-token-${noteId}`);
    const giveToken = tokenCheckbox && tokenCheckbox.checked && !note.receivedPieToken;
    
    // 피드백 저장
    const noteRef = doc(db, 'studentNotes', noteId);
    const updateData = {
      feedback: feedback,
      feedbackDate: new Date().toISOString()
    };
    
    // 파이 토큰 지급 (체크박스가 선택되어 있고 아직 받지 않은 경우에만)
    if (giveToken) {
      updateData.receivedPieToken = true;
      
      // 사용자의 파이 토큰 증가
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        pieTokens: increment(1)
      });
    }
    
    await updateDoc(noteRef, updateData);
    
    // 전역 데이터 업데이트
    note.feedback = feedback;
    note.receivedPieToken = updateData.receivedPieToken || note.receivedPieToken;
    
    // classMap의 학생 정보도 업데이트 (파이토큰 반영)
    if (window.classMap && updateData.receivedPieToken) {
      window.classMap.forEach((classData) => {
        if (classData.students.has(userId)) {
          const student = classData.students.get(userId);
          // Firestore에서 최신 파이토큰 정보 가져오기
          (async () => {
            try {
              const userRef = doc(db, 'users', userId);
              const userSnap = await getDoc(userRef);
              if (userSnap.exists()) {
                const latestUserData = userSnap.data();
                student.pieTokens = latestUserData.pieTokens || 0;
                
                // 현재 선택된 반의 학생 목록이 표시되어 있으면 새로고침
                const activeTab = document.querySelector('.tab-content.active');
                if (activeTab && activeTab.id === 'class-management-tab') {
                  if (window.currentSelectedClass) {
                    selectClass(window.currentSelectedClass);
                  }
                }
              }
            } catch (error) {
              console.error('파이토큰 정보 업데이트 실패:', error);
            }
          })();
        }
      });
    }
    
    alert('피드백이 저장되었습니다.' + (updateData.receivedPieToken ? ' 파이 토큰 1개가 지급되었습니다.' : ''));
    
    // 모달 닫기
    closeFeedbackWindow();
    
    // 현재 탭에 따라 목록 새로고침
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab) {
      if (activeTab.id === 'date-filter-tab') {
        // 날짜별 확인 탭: 현재 선택된 날짜의 학생 목록 다시 표시
        const activeDateItem = document.querySelector('.date-list-item.active');
        if (activeDateItem) {
          const dateKey = activeDateItem.getAttribute('data-date');
          if (dateKey) {
            selectDateForFilter(dateKey);
          }
        }
      } else if (activeTab.id === 'unreviewed-tab') {
        // 확인하지 않은 일기 목록 새로고침
        const unreviewedNotes = window.allNotesData.filter(({ data: n }) => {
          return !isTestModeData(n) && (!n.feedback || n.feedback.trim().length === 0);
        });
        window.unreviewedNotes = unreviewedNotes;
        // 정렬 상태 유지하며 정렬 적용
        applyUnreviewedSort();
      } else if (activeTab.id === 'class-management-tab') {
        // 반별관리 탭인 경우 현재 선택된 반의 학생 목록 새로고침
        if (window.currentSelectedClass) {
          selectClass(window.currentSelectedClass);
        }
      }
    }
    
  } catch (error) {
    console.error('돌려주기 저장 실패:', error);
    alert('돌려주기 저장 중 오류가 발생했습니다.');
  }
};

// 노트 상세 보기 모달 닫기
window.closeTeacherNoteModal = function() {
  const modal = document.getElementById('teacher-note-detail-modal');
  if (modal) {
    modal.remove();
    // 스크롤 복원
    document.body.style.overflow = '';
  }
};

// 피드백 창 열기 (공통 컴포넌트)
window.openFeedbackWindow = function(noteId) {
  if (!window.allNotesData) {
    console.error('allNotesData가 초기화되지 않았습니다.');
    alert('데이터를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
    return;
  }
  
  const noteData = window.allNotesData.find(item => item.id === noteId);
  if (!noteData) {
    alert('노트를 찾을 수 없습니다.');
    return;
  }
  
  const note = noteData.data || noteData;
  const userInfo = note.userInfo || {};
  
  // usersMap에서 최신 사용자 정보 가져오기 (개인정보 수정 반영)
  const userId = note.userId;
  const latestUserInfo = window.usersMap?.get(userId) || userInfo;
  
  // 학생 정보 추출 (최신 정보 우선)
  const grade = latestUserInfo.grade || userInfo.grade || '';
  const classNum = latestUserInfo.classNum || userInfo.classNum || '';
  const number = latestUserInfo.number || userInfo.number || '';
  const className = classNum ? `${grade}학년 ${classNum}반` : '반 정보 없음';
  const studentNumber = number || '번호 없음';
  const studentName = latestUserInfo.name || note.userName || userInfo.name || '이름 없음';
  const studentId = latestUserInfo.studentId || userInfo.studentId || note.userStudentId || '';
  const writeDate = note.activityDate || '';
  
  // 문제 내용 생성
  let problemContentHTML = '';
  if (note.problemData) {
    if (note.problemData.type === 'photo' && note.problemData.imageURL) {
      problemContentHTML = `
        <div class="form-group">
          <label>문제 이미지</label>
          <div class="detail-image-container">
            <img src="${note.problemData.imageURL}" alt="문제 이미지" class="detail-image-preview" 
                 onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'200\\' height=\\'200\\'%3E%3Crect fill=\\'%23f5f5f5\\' width=\\'200\\' height=\\'200\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' text-anchor=\\'middle\\' dy=\\'.3em\\' fill=\\'%23999\\' font-family=\\'sans-serif\\' font-size=\\'14\\'%3E이미지를 불러올 수 없습니다%3C/text%3E%3C/svg%3E';" />
          </div>
        </div>
      `;
    } else if (note.problemData.type === 'text' && note.problemData.content) {
      problemContentHTML = `
        <div class="form-group">
          <label>문제 텍스트</label>
          <div class="detail-text-content">${note.problemData.content.replace(/\n/g, '<br>')}</div>
        </div>
      `;
    } else if (note.problemData.type === 'draw' && note.problemData.imageURL) {
      problemContentHTML = `
        <div class="form-group">
          <label>그린 문제</label>
          <div class="detail-image-container">
            <img src="${note.problemData.imageURL}" alt="그린 문제" class="detail-image-preview" 
                 onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'200\\' height=\\'200\\'%3E%3Crect fill=\\'%23f5f5f5\\' width=\\'200\\' height=\\'200\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' text-anchor=\\'middle\\' dy=\\'.3em\\' fill=\\'%23999\\' font-family=\\'sans-serif\\' font-size=\\'14\\'%3E이미지를 불러올 수 없습니다%3C/text%3E%3C/svg%3E';" />
          </div>
        </div>
      `;
    } else if (note.problemData.type === 'draw' && !note.problemData.imageURL) {
      problemContentHTML = `
        <div class="form-group">
          <label>문제</label>
          <div class="detail-text-content">그림이 저장되지 않았습니다.</div>
        </div>
      `;
    }
  }
  
  // 챗봇 대화 내역 생성
  let chatHistoryHTML = '';
  if (note.chatHistory && Array.isArray(note.chatHistory) && note.chatHistory.length > 0) {
    chatHistoryHTML = `
      <div class="form-group">
        <label>챗봇과의 대화</label>
        <div class="detail-chat-history">
          ${note.chatHistory.map((msg, index) => {
            const role = msg.role === 'user' ? '학생' : '선생님';
            const roleClass = msg.role === 'user' ? 'chat-user' : 'chat-assistant';
            return `
              <div class="chat-message ${roleClass}">
                <span class="chat-role">${role}:</span>
                <span class="chat-content">${msg.content.replace(/\n/g, '<br>')}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }
  
  // 피드백 섹션 생성
  const currentFeedback = note.feedback || '';
  const hasFeedback = currentFeedback.trim().length > 0;
  const hasReceivedPieToken = note.receivedPieToken === true;
  
  const feedbackHTML = `
    <div class="form-group feedback-section">
      <label>교사 피드백</label>
      ${hasFeedback ? `
        <div class="existing-feedback">
          <div class="detail-text-content">${currentFeedback.replace(/\n/g, '<br>')}</div>
          ${hasReceivedPieToken ? '<div class="pie-token-indicator">🥧 파이 토큰 지급됨</div>' : ''}
        </div>
      ` : ''}
      <div class="feedback-input-section">
        <div class="feedback-input-header">
          <button id="suggest-feedback-btn" class="btn-suggest-feedback" onclick="suggestFeedback('${noteId}')">
            💡 피드백 추천받기
          </button>
        </div>
        <textarea 
          id="feedback-textarea-${noteId}" 
          class="feedback-textarea" 
          placeholder="학생에게 피드백을 작성해주세요..."
          rows="5"
        >${currentFeedback}</textarea>
        <div class="feedback-actions">
          <div class="token-option-section">
            <label class="token-checkbox-label">
              <input 
                type="checkbox" 
                id="give-token-${noteId}" 
                class="token-checkbox"
                ${hasReceivedPieToken ? 'disabled' : 'checked'}
              >
              <span>🥧 파이 토큰 지급하기</span>
            </label>
            ${hasReceivedPieToken ? '<span class="token-already-given-hint">이미 토큰이 지급되었습니다.</span>' : ''}
          </div>
          <button class="btn-save-feedback" onclick="saveFeedback('${noteId}')">
            💾 돌려주기 저장
          </button>
        </div>
      </div>
    </div>
  `;
  
  // 피드백 창 HTML 생성
  const feedbackWindowHTML = `
    <div id="feedback-window-modal" class="modal">
      <div class="modal-content modal-content-large">
        <div class="modal-header">
          <h2>💬 돌려주기</h2>
          <button class="modal-close" onclick="closeFeedbackWindow()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>학생 정보</label>
            <div class="detail-info">
              <p><strong>반:</strong> ${className}</p>
              <p><strong>번호:</strong> ${studentNumber}</p>
              <p><strong>이름:</strong> ${studentName}</p>
              <p><strong>작성 날짜:</strong> ${writeDate}</p>
            </div>
          </div>
          ${(note.studyHours !== undefined || note.studyMinutes !== undefined) ? `
            <div class="form-group">
              <label>⏰ 수학 공부시간</label>
              <div class="detail-info">
                ${(note.studyHours || 0)}시간 ${(note.studyMinutes || 0)}분
              </div>
            </div>
          ` : ''}
          <div class="form-group">
            <label>오늘의 감정</label>
            <div class="detail-emotion">
              <span class="detail-emotion-icon">${note.emotion || '😊'}</span>
            </div>
          </div>
          ${chatHistoryHTML}
          ${note.diaryContent ? `
            <div class="form-group">
              <label>일기 내용</label>
              <div class="detail-text-content">${note.diaryContent.replace(/\n/g, '<br>')}</div>
            </div>
          ` : ''}
          ${problemContentHTML}
          ${note.problemExplanation ? `
            <div class="form-group">
              <label>문제 설명</label>
              <div class="detail-text-content">${note.problemExplanation.replace(/\n/g, '<br>')}</div>
            </div>
          ` : ''}
          ${feedbackHTML}
        </div>
        <div class="modal-footer">
          <button class="btn btn-cancel" onclick="closeFeedbackWindow()">닫기</button>
        </div>
      </div>
    </div>
  `;
  
  // 기존 모달 제거
  const existingModal = document.getElementById('feedback-window-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // 모달 추가
  document.body.insertAdjacentHTML('beforeend', feedbackWindowHTML);
  
  // 모달 외부 클릭 시 닫기
  const modal = document.getElementById('feedback-window-modal');
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        closeFeedbackWindow();
      }
    });
    
    // ESC 키로 닫기
    const escapeHandler = function(e) {
      if (e.key === 'Escape') {
        closeFeedbackWindow();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);
  }
  
  // 스크롤 방지
  document.body.style.overflow = 'hidden';
};

// 피드백 창 닫기
window.closeFeedbackWindow = function() {
  const modal = document.getElementById('feedback-window-modal');
  if (modal) {
    modal.remove();
    document.body.style.overflow = '';
  }
};

// 반별관리 탭 초기화
function initializeClassManagement(allNotes, usersMap) {
  if (!usersMap || usersMap.size === 0) {
    const classFilterList = document.getElementById('class-filter-list');
    if (classFilterList) {
      classFilterList.innerHTML = '<p class="empty-text">학생 정보가 없습니다.</p>';
    }
    return;
  }
  
  try {
    // 반별로 그룹화
    const classMap = new Map();
    
    // 일기가 있는 학생들을 먼저 처리
    if (allNotes && allNotes.length > 0) {
      allNotes.forEach(({ id, data: note }) => {
        try {
          const userInfo = note.userInfo || {};
          const grade = userInfo.grade || '';
          const classNum = userInfo.classNum || '';
          
          if (grade && classNum) {
            const classKey = `${grade}-${classNum}`;
            if (!classMap.has(classKey)) {
              classMap.set(classKey, {
                grade: grade,
                classNum: classNum,
                students: new Map()
              });
            }
            
            const userId = note.userId;
            if (userId) {
              const classData = classMap.get(classKey);
              // usersMap에서 최신 사용자 정보 가져오기 (개인정보 수정 반영)
              const latestUserInfo = usersMap.get(userId) || userInfo;
              
              if (!classData.students.has(userId)) {
                // 사용자 정보에서 파이토큰 가져오기
                const pieTokens = latestUserInfo.pieTokens || 0;
                classData.students.set(userId, {
                  userId: userId,
                  name: latestUserInfo.name || note.userName || '이름 없음', // 최신 사용자 정보 우선
                  studentId: latestUserInfo.studentId || '',
                  number: latestUserInfo.number || '',
                  pieTokens: pieTokens,
                  notes: []
                });
              } else {
                // 이미 존재하는 학생의 경우 최신 정보로 업데이트
                const existingStudent = classData.students.get(userId);
                // 최신 사용자 정보로 업데이트 (개인정보 수정 반영)
                existingStudent.name = latestUserInfo.name || existingStudent.name || '이름 없음';
                existingStudent.studentId = latestUserInfo.studentId || existingStudent.studentId;
                existingStudent.number = latestUserInfo.number || existingStudent.number;
                if (latestUserInfo.pieTokens !== undefined) {
                  existingStudent.pieTokens = latestUserInfo.pieTokens;
                }
              }
              classData.students.get(userId).notes.push({ id, note });
            }
          }
        } catch (error) {
          console.error('반별 그룹화 중 오류:', id, error);
        }
      });
    }
    
    // 일기를 작성하지 않은 학생들도 추가
    usersMap.forEach((userData, userId) => {
      try {
        // 관리자 계정 제외
        if (isTestModeData({ userId: userId })) {
          return;
        }
        
        const grade = userData.grade || '';
        const classNum = userData.classNum || '';
        
        // 학년과 반 정보가 있는 학생만 추가
        if (grade && classNum) {
          const classKey = `${grade}-${classNum}`;
          
          // 반이 없으면 생성
          if (!classMap.has(classKey)) {
            classMap.set(classKey, {
              grade: grade,
              classNum: classNum,
              students: new Map()
            });
          }
          
          // 이미 일기로 추가된 학생이 아니면 추가
          const classData = classMap.get(classKey);
          if (!classData.students.has(userId)) {
            classData.students.set(userId, {
              userId: userId,
              name: userData.name || '이름 없음',
              studentId: userData.studentId || '',
              number: userData.number || '',
              pieTokens: userData.pieTokens || 0,
              notes: [] // 일기가 없으므로 빈 배열
            });
          }
        }
      } catch (error) {
        console.error('학생 정보 처리 중 오류:', userId, error);
      }
    });
    
    // 반 목록 표시
    displayClassFilters(classMap);
    
    // 전역 변수에 저장
    window.classMap = classMap;
    
    console.log('반별관리 탭 초기화 완료:', classMap.size, '개 반');
  } catch (error) {
    console.error('반별관리 탭 초기화 실패:', error);
    const classFilterList = document.getElementById('class-filter-list');
    if (classFilterList) {
      classFilterList.innerHTML = '<p class="error-text">반 정보를 불러오는 중 오류가 발생했습니다.</p>';
    }
  }
}

// 반 필터 목록 표시
function displayClassFilters(classMap) {
  const classFilterList = document.getElementById('class-filter-list');
  if (!classFilterList) return;
  
  if (classMap.size === 0) {
    classFilterList.innerHTML = '<p class="empty-text">반 정보가 없습니다.</p>';
    return;
  }
  
  // 반 정렬 (학년, 반 순서)
  const sortedClasses = Array.from(classMap.keys()).sort((a, b) => {
    const [gradeA, classA] = a.split('-').map(Number);
    const [gradeB, classB] = b.split('-').map(Number);
    if (gradeA !== gradeB) return gradeA - gradeB;
    return classA - classB;
  });
  
  let html = '<div class="class-checkboxes">';
  sortedClasses.forEach(classKey => {
    const classData = classMap.get(classKey);
    const studentCount = classData.students.size;
    
    html += `
      <button class="class-filter-btn" data-class="${classKey}" onclick="selectClass('${classKey}')">
        ${classData.grade}학년 ${classData.classNum}반
        <span class="class-student-count">(${studentCount}명)</span>
      </button>
    `;
  });
  html += '</div>';
  
  classFilterList.innerHTML = html;
}

// 반 선택 처리
window.selectClass = function(classKey) {
  if (!window.classMap) {
    console.error('classMap이 초기화되지 않았습니다.');
    return;
  }
  
  const classData = window.classMap.get(classKey);
  if (!classData) {
    console.error('반 정보를 찾을 수 없습니다:', classKey);
    return;
  }
  
  // 모든 반 버튼 비활성화
  document.querySelectorAll('.class-filter-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // 선택한 반 버튼 활성화
  const selectedBtn = document.querySelector(`[data-class="${classKey}"]`);
  if (selectedBtn) {
    selectedBtn.classList.add('active');
  }
  
  // 학생 목록 표시
  displayClassStudents(classData);
};

// 반별 학생 목록 표시
function displayClassStudents(classData) {
  const container = document.getElementById('students-list-container');
  const title = document.getElementById('selected-class-title');
  
  if (!container || !title) {
    console.error('DOM 요소를 찾을 수 없습니다.');
    return;
  }
  
  title.textContent = `${classData.grade}학년 ${classData.classNum}반 학생 목록`;
  
  // 학생을 번호순으로 정렬
  const students = Array.from(classData.students.values()).sort((a, b) => {
    const numA = parseInt(a.number) || 999;
    const numB = parseInt(b.number) || 999;
    return numA - numB;
  });
  
  if (students.length === 0) {
    container.innerHTML = '<p class="empty-message">학생이 없습니다.</p>';
    return;
  }
  
  let html = '<div class="students-grid">';
  students.forEach(student => {
    const notesCount = student.notes.length;
    const latestNote = student.notes.length > 0 ? student.notes[0].note : null;
    const latestDate = latestNote ? latestNote.activityDate : '작성 없음';
    
    html += `
      <div class="student-card" onclick="openStudentDetailPage('${student.userId}')">
        <div class="student-header">
          <span class="student-number">${student.number}번</span>
          <span class="student-name">${student.name}</span>
        </div>
        <div class="student-info">
          <p>학번: ${student.studentId || '없음'}</p>
          <p>작성한 일기: ${notesCount}개</p>
          <p>최근 작성일: ${latestDate}</p>
          <p class="student-pie-tokens">🥧 파이 토큰: ${student.pieTokens || 0}개</p>
        </div>
      </div>
    `;
  });
  html += '</div>';
  
  container.innerHTML = html;
}

// 학생 상세 페이지로 이동
window.openStudentDetailPage = function(userId) {
  // 새로운 페이지로 이동 (URL 파라미터로 userId 전달)
  window.location.href = `studentDetail.html?userId=${userId}`;
};

// 기존 함수는 호환성을 위해 유지 (다른 곳에서 사용할 수 있음)
window.openStudentDetail = function(userId) {
  openStudentDetailPage(userId);
};

// 학생 일기 목록 표시
function displayStudentNotesList(userId, notes) {
  const container = document.getElementById('students-list-container');
  if (!container) return;
  
  // 시간순 정렬 (최신순)
  notes.sort((a, b) => {
    const dateA = new Date(a.data.timestamp);
    const dateB = new Date(b.data.timestamp);
    return dateB - dateA;
  });
  
  let html = '<div class="student-notes-list">';
  html += '<button class="btn-back-to-students" onclick="selectClassFromStudent()">← 학생 목록으로</button>';
  html += '<h3>작성한 일기 목록</h3>';
  
  notes.forEach(({ id, data: note }) => {
    const date = note.activityDate || '';
    const time = note.activityTime || '';
    const emotion = note.emotion || '😊';
    const hasFeedback = note.feedback && note.feedback.trim().length > 0;
    
    html += `
      <div class="student-note-item" onclick="openFeedbackWindow('${id}')">
        <div class="student-note-header">
          <span class="student-note-emotion">${emotion}</span>
          <div class="student-note-info">
            <span class="student-note-date">${date} ${time}</span>
            ${hasFeedback ? '<span class="feedback-badge">💬 피드백 있음</span>' : '<span class="no-feedback-badge">📝 피드백 없음</span>'}
          </div>
        </div>
        <div class="student-note-preview">
          ${note.diaryContent ? `<p>${note.diaryContent.substring(0, 80)}${note.diaryContent.length > 80 ? '...' : ''}</p>` : '<p>일기 내용 없음</p>'}
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
  
  // 전역 변수에 현재 선택된 반 저장
  window.currentSelectedClass = null;
  window.classMap.forEach((classData, classKey) => {
    if (classData.students.has(userId)) {
      window.currentSelectedClass = classKey;
    }
  });
}

window.selectClassFromStudent = function() {
  if (window.currentSelectedClass) {
    selectClass(window.currentSelectedClass);
  }
};

// 확인하지 않은 일기 탭 초기화
function initializeUnreviewedNotes(allNotes) {
  if (!allNotes || allNotes.length === 0) {
    const unreviewedList = document.getElementById('unreviewed-list');
    if (unreviewedList) {
      unreviewedList.innerHTML = '<p class="empty-text">확인하지 않은 일기가 없습니다.</p>';
    }
    return;
  }
  
  try {
    // 피드백이 없는 일기만 필터링
    const unreviewedNotes = allNotes.filter(({ data: note }) => {
      return !isTestModeData(note) && (!note.feedback || note.feedback.trim().length === 0);
    });
    
    // 전역 변수에 저장
    window.unreviewedNotes = unreviewedNotes;
    
    // 기본 정렬: 날짜 내림차순 (최신순)
    window.unreviewedSortBy = 'date';
    window.unreviewedSortOrder = 'desc';
    
    // 정렬 적용
    applyUnreviewedSort();
    
    console.log('확인하지 않은 일기 탭 초기화 완료:', unreviewedNotes.length, '개');
  } catch (error) {
    console.error('확인하지 않은 일기 탭 초기화 실패:', error);
    const unreviewedList = document.getElementById('unreviewed-list');
    if (unreviewedList) {
      unreviewedList.innerHTML = '<p class="error-text">일기 목록을 불러오는 중 오류가 발생했습니다.</p>';
    }
  }
}

// 정렬 순서 설정
window.setSortOrder = function(order) {
  window.unreviewedSortOrder = order;
  
  // 버튼 활성화 상태 업데이트
  const ascBtn = document.getElementById('sort-asc-btn');
  const descBtn = document.getElementById('sort-desc-btn');
  
  if (ascBtn && descBtn) {
    if (order === 'asc') {
      ascBtn.classList.add('active');
      descBtn.classList.remove('active');
    } else {
      descBtn.classList.add('active');
      ascBtn.classList.remove('active');
    }
  }
  
  applyUnreviewedSort();
};

// 확인하지 않은 일기 정렬 적용
window.applyUnreviewedSort = function() {
  if (!window.unreviewedNotes || window.unreviewedNotes.length === 0) {
    return;
  }
  
  const sortBy = document.getElementById('sort-by')?.value || window.unreviewedSortBy || 'date';
  const sortOrder = window.unreviewedSortOrder || 'desc';
  
  window.unreviewedSortBy = sortBy;
  
  // 정렬된 배열 생성 (원본 배열 복사)
  const sortedNotes = [...window.unreviewedNotes];
  
  sortedNotes.sort((a, b) => {
    const noteA = a.data || a;
    const noteB = b.data || b;
    
    let comparison = 0;
    
    if (sortBy === 'class') {
      // 반 기준 정렬: 학년 -> 반 -> 번호 순서
      const userInfoA = noteA.userInfo || {};
      const userInfoB = noteB.userInfo || {};
      
      const gradeA = parseInt(userInfoA.grade) || 0;
      const gradeB = parseInt(userInfoB.grade) || 0;
      const classNumA = parseInt(userInfoA.classNum) || 0;
      const classNumB = parseInt(userInfoB.classNum) || 0;
      const numberA = parseInt(userInfoA.number) || 0;
      const numberB = parseInt(userInfoB.number) || 0;
      
      // 학년 비교
      if (gradeA !== gradeB) {
        comparison = gradeA - gradeB;
      } else if (classNumA !== classNumB) {
        // 반 비교
        comparison = classNumA - classNumB;
      } else {
        // 번호 비교
        comparison = numberA - numberB;
      }
    } else if (sortBy === 'date') {
      // 날짜 기준 정렬
      const dateA = noteA.timestamp ? new Date(noteA.timestamp).getTime() : 0;
      const dateB = noteB.timestamp ? new Date(noteB.timestamp).getTime() : 0;
      comparison = dateA - dateB;
    }
    
    // 내림차순이면 비교 결과 반전
    return sortOrder === 'desc' ? -comparison : comparison;
  });
  
  displayUnreviewedList(sortedNotes);
};

// 확인하지 않은 일기 목록 표시
function displayUnreviewedList(notes) {
  const container = document.getElementById('unreviewed-list');
  if (!container) return;
  
  if (notes.length === 0) {
    container.innerHTML = '<p class="empty-text">확인하지 않은 일기가 없습니다.</p>';
    return;
  }
  
  let html = '';
  notes.forEach(({ id, data: note }) => {
    const userInfo = note.userInfo || {};
    // usersMap에서 최신 사용자 정보 가져오기 (개인정보 수정 반영)
    const userId = note.userId;
    const latestUserInfo = window.usersMap?.get(userId) || userInfo;
    
    const grade = latestUserInfo.grade || userInfo.grade || '';
    const classNum = latestUserInfo.classNum || userInfo.classNum || '';
    const number = latestUserInfo.number || userInfo.number || '';
    const className = classNum ? `${grade}학년 ${classNum}반` : '반 정보 없음';
    const studentNumber = number || '번호 없음';
    const studentName = latestUserInfo.name || note.userName || userInfo.name || '이름 없음';
    const writeDate = note.activityDate || '';
    const emotion = note.emotion || '😊';
    
    html += `
      <div class="unreviewed-item" onclick="openFeedbackWindow('${id}')">
        <div class="unreviewed-student-info">
          <p class="unreviewed-class">${className}</p>
          <p class="unreviewed-name">${studentNumber}번 ${studentName}</p>
        </div>
        <div class="unreviewed-date-info">
          <span class="unreviewed-emotion">${emotion}</span>
          <span class="unreviewed-date">${writeDate}</span>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

// 토큰 랭킹 탭 초기화
function initializeTokenRanking(usersMap) {
  if (!usersMap || usersMap.size === 0) {
    const rankingList = document.getElementById('token-ranking-list');
    if (rankingList) {
      rankingList.innerHTML = '<p class="empty-text">학생 정보가 없습니다.</p>';
    }
    return;
  }
  
  try {
    // 학생 정보 배열로 변환 (관리자 제외)
    const students = [];
    usersMap.forEach((userData, userId) => {
      // 관리자가 아닌 학생만 포함
      if (!isTestModeData({ userId: userId })) {
        const pieTokens = userData.pieTokens || 0;
        const name = userData.name || '이름 없음';
        const studentId = userData.studentId || '';
        const grade = userData.grade || '';
        const classNum = userData.classNum || '';
        const number = userData.number || '';
        
        students.push({
          userId: userId,
          name: name,
          studentId: studentId,
          grade: grade,
          classNum: classNum,
          number: number,
          pieTokens: pieTokens
        });
      }
    });
    
    // 토큰 개수로 내림차순 정렬
    students.sort((a, b) => b.pieTokens - a.pieTokens);
    
    displayTokenRanking(students);
    
    console.log('토큰 랭킹 탭 초기화 완료:', students.length, '명');
  } catch (error) {
    console.error('토큰 랭킹 탭 초기화 실패:', error);
    const rankingList = document.getElementById('token-ranking-list');
    if (rankingList) {
      rankingList.innerHTML = '<p class="error-text">랭킹을 불러오는 중 오류가 발생했습니다.</p>';
    }
  }
}

// 토큰 랭킹 표시
function displayTokenRanking(students) {
  const container = document.getElementById('token-ranking-list');
  if (!container) return;
  
  if (students.length === 0) {
    container.innerHTML = '<p class="empty-text">학생 정보가 없습니다.</p>';
    return;
  }
  
  let html = '<div class="ranking-list">';
  
  students.forEach((student, index) => {
    const rank = index + 1;
    const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}위`;
    const className = student.grade && student.classNum 
      ? `${student.grade}학년 ${student.classNum}반` 
      : '반 정보 없음';
    
    html += `
      <div class="ranking-item" onclick="openStudentDetailPage('${student.userId}')">
        <div class="ranking-rank">
          <span class="rank-number">${rankEmoji}</span>
        </div>
        <div class="ranking-student-info">
          <div class="ranking-student-name">${student.name}</div>
          <div class="ranking-student-class">${className} ${student.number}번</div>
          <div class="ranking-student-id">학번: ${student.studentId || '없음'}</div>
        </div>
        <div class="ranking-tokens">
          <span class="token-count">🥧 ${student.pieTokens}개</span>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
}
