// Firebase 초기화 및 인증 관리
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, orderBy, doc, deleteDoc, updateDoc, setDoc, getDoc, arrayUnion } from 'firebase/firestore';
import { firebaseConfig, teacherEmails, adminUids, isFirebaseConfigValid } from './firebaseConfig.js';

// Firebase 초기화
let app;
let auth;
let provider;
let db;

// Firebase 설정 검증
if (!isFirebaseConfigValid()) {
  console.error('Firebase 설정이 완전하지 않습니다.');
  console.error('firebaseConfig:', firebaseConfig);
  
  // DOM이 로드된 후 에러 메시지 표시
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      showFirebaseError();
    });
  } else {
    showFirebaseError();
  }
} else {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    provider = new GoogleAuthProvider();
    
    // Google 로그인 시 이메일 선택 화면 표시
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    
    console.log('✅ Firebase 초기화 성공');
  } catch (error) {
    console.error('❌ Firebase 초기화 실패:', error);
    console.error('에러 상세:', {
      code: error.code,
      message: error.message,
      config: firebaseConfig
    });
    showFirebaseError(error);
  }
}

// Firebase 오류 표시 함수
function showFirebaseError(error = null) {
  const loginSection = document.getElementById('login-section');
  if (loginSection) {
    loginSection.innerHTML = `
      <div class="error-message">
        <h3>⚠️ Firebase 설정 오류</h3>
        <p>Firebase 설정에 문제가 있습니다. 다음을 확인해주세요:</p>
        <ul style="text-align: left; margin: 1rem 0;">
          <li>.env 파일이 프로젝트 루트에 있는지 확인</li>
          <li>모든 VITE_FIREBASE_* 환경변수가 설정되어 있는지 확인</li>
          <li>개발 서버를 재시작했는지 확인 (npm run dev)</li>
        </ul>
        ${error ? `<p style="color: #d32f2f; font-size: 0.9rem;">에러: ${error.message}</p>` : ''}
        <p style="font-size: 0.9rem; color: #666;">브라우저 콘솔(F12)에서 더 자세한 정보를 확인할 수 있습니다.</p>
      </div>
    `;
  }
}

// DOM 요소
const loginSection = document.getElementById('login-section');
const menuSection = document.getElementById('menu-section');
const loginButton = document.getElementById('google-login-btn');
const logoutButton = document.getElementById('logout-btn');
const userInfo = document.getElementById('user-info');
const buttonGroup = document.getElementById('button-group');
const studentDashboard = document.getElementById('student-dashboard');
const calendarContainer = document.getElementById('calendar-container');
const notesList = document.getElementById('notes-list');

// 전역 변수
let currentUserId = null;
let notesDataWithIds = []; // 문서 ID와 함께 저장된 데이터
let currentCalendarYear = new Date().getFullYear();
let currentCalendarMonth = new Date().getMonth(); // 0-11 형식

// 학번 파싱 함수 (5자리 숫자: 1자리=학년, 2-3자리=반, 4-5자리=번호)
// 0으로 시작하는 학번도 올바르게 처리 (예: 04152 → 0학년, 41반, 52번)
function parseStudentId(studentId) {
  // 문자열로 변환하여 앞의 0이 사라지지 않도록 보장
  const studentIdStr = String(studentId).trim();
  
  // 5자리 숫자인지 확인 (앞의 0 포함)
  if (!studentIdStr || studentIdStr.length !== 5 || !/^\d{5}$/.test(studentIdStr)) {
    return null; // 유효하지 않은 학번 형식
  }
  
  // 각 자리를 문자열로 추출한 후 숫자로 변환 (0도 올바르게 처리)
  const grade = parseInt(studentIdStr[0], 10); // 1번째 자리: 학년 (0 포함)
  const classNum = parseInt(studentIdStr.substring(1, 3), 10); // 2-3번째 자리: 반
  const number = parseInt(studentIdStr.substring(3, 5), 10); // 4-5번째 자리: 번호
  
  return {
    grade,
    classNum,
    number
  };
}

// Google 로그인
async function handleGoogleLogin() {
  if (!auth || !provider) {
    alert('Firebase가 초기화되지 않았습니다. 설정을 확인해주세요.');
    return;
  }

  try {
    loginButton.disabled = true;
    loginButton.innerHTML = '<span>로그인 중...</span>';
    
    const result = await signInWithPopup(auth, provider);
    console.log('로그인 성공:', result.user);
  } catch (error) {
    console.error('로그인 실패:', error);
    
    let errorMessage = '로그인에 실패했습니다.';
    if (error.code === 'auth/popup-closed-by-user') {
      errorMessage = '로그인 창이 닫혔습니다. 다시 시도해주세요.';
    } else if (error.code === 'auth/popup-blocked') {
      errorMessage = '팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용해주세요.';
    } else if (error.code === 'auth/network-request-failed') {
      errorMessage = '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.';
    }
    
    alert(errorMessage);
  } finally {
    if (loginButton) {
      loginButton.disabled = false;
      loginButton.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        <span>Google로 로그인</span>
      `;
    }
  }
}

// 로그아웃
async function handleLogout() {
  try {
    await signOut(auth);
    console.log('로그아웃 성공');
  } catch (error) {
    console.error('로그아웃 실패:', error);
  }
}

// 관리자 여부 확인 (UID 기반)
function isAdmin(uid) {
  if (!uid || adminUids.length === 0) {
    return false;
  }
  return adminUids.includes(uid);
}

// 교사 여부 확인 (이메일 기반 - 하위 호환성 유지)
function isTeacher(email) {
  return teacherEmails.includes(email);
}

// 이모티콘의 감정 유형 판단 (긍정/부정)
function getEmotionType(emotion) {
  if (!emotion) return null;
  
  // 긍정적인 감정 이모티콘
  const positiveEmotions = [
    '😊', '😄', '😁', '🥳', '😍', '🤩', '😎', '🙌', '✨', '🌟', '❤️',
    '🎯', '💪', '🔥', '⚡', '🚀', '🏆', '💯', '⭐', '💫', '🌈',
    '📚', '📖', '✏️', '📝', '💡', '🧠', '🤔', '🧐', '📊', '📈'
  ];
  
  // 부정적인 감정 이모티콘
  const negativeEmotions = [
    '😢', '😰', '😞', '😓', '😔', '😣', '😫', '😩', '😭', '😤', '🤢', '😱', '😡',
    '😷', '🤧', '🤒', '📉'
  ];
  
  if (positiveEmotions.includes(emotion)) {
    return 'positive';
  } else if (negativeEmotions.includes(emotion)) {
    return 'negative';
  }
  
  return null; // 중립적인 감정은 색상 없음
}

// 달력 생성
async function createCalendar(notesData, year, month) {
  // 현재 날짜 확인 (오늘 날짜 표시용)
  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  
  // 테스트 모드 확인
  const urlParams = new URLSearchParams(window.location.search);
  const isTestMode = urlParams.get('test') === 'student';
  
  // 해당 월의 첫 날과 마지막 날
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();
  
  // 날짜별 노트 그룹화 (같은 날짜의 여러 노트)
  const notesByDate = {};
  notesData.forEach((item) => {
    const id = item.id;
    const note = item.data || item;
    // activityYear, activityMonth, activityDay가 문자열일 수도 있으므로 parseInt 사용
    const noteYear = parseInt(note.activityYear);
    const noteDate = parseInt(note.activityDay);
    const noteMonth = parseInt(note.activityMonth);
    
    // 날짜 비교 (year는 숫자, month는 1-12, day는 1-31)
    if (noteYear === year && noteMonth === month + 1 && id) {
      const dateKey = `${year}-${String(noteMonth).padStart(2, '0')}-${String(noteDate).padStart(2, '0')}`;
      if (!notesByDate[dateKey]) {
        notesByDate[dateKey] = [];
      }
      notesByDate[dateKey].push({ id, note });
    }
  });
  
  // 대표 이모티콘 가져오기 (users 컬렉션에서)
  let representativeEmotions = {};
  if (currentUserId && db) {
    try {
      const userRef = doc(db, 'users', currentUserId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        representativeEmotions = userSnap.data().representativeEmotions || {};
      }
    } catch (error) {
      console.error('대표 이모티콘 조회 실패:', error);
    }
  }
  
  // 날짜별 이모티콘 및 노트 ID 매핑
  const emotionMap = {};
  const noteIdMap = {};
  const notesCountMap = {}; // 같은 날짜의 노트 개수
  
  Object.keys(notesByDate).forEach(dateKey => {
    const notes = notesByDate[dateKey];
    const day = parseInt(dateKey.split('-')[2]);
    notesCountMap[day] = notes.length;
    
    // 대표 이모티콘이 있으면 사용, 없으면 첫 번째 노트의 이모티콘 사용
    const representativeEmotion = representativeEmotions[dateKey];
    const selectedNote = representativeEmotion 
      ? notes.find(n => n.note.emotion === representativeEmotion) || notes[0]
      : notes[0];
    
    emotionMap[day] = selectedNote.note.emotion;
    noteIdMap[day] = selectedNote.id;
  });
  
  // 요일 헤더
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  let calendarHTML = '<div class="calendar-grid">';
  
  // 요일 헤더
  weekdays.forEach(day => {
    calendarHTML += `<div class="calendar-header">${day}</div>`;
  });
  
  // 빈 칸 (첫 주 시작 전)
  for (let i = 0; i < startingDayOfWeek; i++) {
    calendarHTML += '<div class="calendar-day empty"></div>';
  }
  
  // 날짜 칸
  for (let day = 1; day <= daysInMonth; day++) {
    const emotion = emotionMap[day];
    const noteId = noteIdMap[day];
    const notesCount = notesCountMap[day] || 0;
    const isToday = isCurrentMonth && day === now.getDate();
    const hasNote = !!emotion;
    const emotionType = getEmotionType(emotion);
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    // 클래스 조합
    let dayClasses = 'calendar-day';
    if (isToday) dayClasses += ' today';
    if (hasNote) dayClasses += ' has-note';
    if (emotionType === 'positive') dayClasses += ' emotion-positive';
    if (emotionType === 'negative') dayClasses += ' emotion-negative';
    if (notesCount > 1) dayClasses += ' has-multiple-notes';
    
    // 테스트 모드에서는 모든 날짜를 클릭 가능하게 만들기
    let onClickHandler = '';
    let cursorStyle = '';
    
    // isToday는 이미 위에서 선언됨 (284번 줄: isCurrentMonth && day === now.getDate())
    // 일반 모드에서 오늘 날짜인지 확인하기 위해 추가 검증 필요
    const today = new Date();
    const isTodayForWriting = year === today.getFullYear() && 
                              month === today.getMonth() && 
                              day === today.getDate();
    
    if (isTestMode) {
      // 테스트 모드: 모든 날짜 클릭 가능
      if (hasNote) {
        // 일기가 있는 경우: 기존 모달 열기
        onClickHandler = `onclick="openCalendarEmotionModal('${dateKey}', ${day}, ${year}, ${month + 1})"`;
      } else {
        // 일기가 없는 경우: student.html로 이동하여 일기 작성
        onClickHandler = `onclick="openDiaryForDate('${dateKey}', ${year}, ${month + 1}, ${day})"`;
      }
      cursorStyle = 'cursor: pointer;';
    } else {
      // 일반 모드 (학생 계정)
      if (hasNote) {
        // 일기가 있는 날짜: 수정 가능 (모달 열기)
        onClickHandler = `onclick="openCalendarEmotionModal('${dateKey}', ${day}, ${year}, ${month + 1})"`;
        cursorStyle = 'cursor: pointer;';
      } else if (isTodayForWriting) {
        // 오늘 날짜이고 일기가 없으면: 일기 작성 가능
        onClickHandler = `onclick="openDiaryForDate('${dateKey}', ${year}, ${month + 1}, ${day})"`;
        cursorStyle = 'cursor: pointer;';
      }
      // 오늘 날짜가 아니고 일기가 없으면: 클릭 불가능 (onClickHandler와 cursorStyle이 빈 문자열로 유지)
    }
    
    calendarHTML += `
      <div class="${dayClasses}" 
           ${onClickHandler}
           style="${cursorStyle}">
        <span class="day-number">${day}</span>
        ${emotion ? `<span class="day-emotion">${emotion}</span>` : ''}
        ${notesCount > 1 ? `<span class="notes-count-badge">${notesCount}</span>` : ''}
        ${isTestMode && !hasNote ? `<span class="test-mode-indicator" title="클릭하여 일기 작성">✏️</span>` : ''}
      </div>
    `;
  }
  
  calendarHTML += '</div>';
  return Promise.resolve(calendarHTML);
}

// 달력 월 업데이트
function updateCalendarMonth(direction) {
  if (direction === 'prev') {
    currentCalendarMonth--;
    if (currentCalendarMonth < 0) {
      currentCalendarMonth = 11;
      currentCalendarYear--;
    }
  } else if (direction === 'next') {
    currentCalendarMonth++;
    if (currentCalendarMonth > 11) {
      currentCalendarMonth = 0;
      currentCalendarYear++;
    }
  }
  
  // 월 제목 업데이트
  updateCalendarTitle();
  
  // 달력 다시 생성
  if (calendarContainer && notesDataWithIds.length > 0) {
    createCalendar(notesDataWithIds, currentCalendarYear, currentCalendarMonth).then(html => {
      calendarContainer.innerHTML = html;
    });
  }
}

// 달력 제목 업데이트
function updateCalendarTitle() {
  const monthTitle = document.getElementById('calendar-month-title');
  if (monthTitle) {
    const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
    monthTitle.textContent = `📅 ${currentCalendarYear}년 ${monthNames[currentCalendarMonth]}`;
  }
}

// 오늘 날짜로 돌아가기
function goToToday() {
  const now = new Date();
  currentCalendarYear = now.getFullYear();
  currentCalendarMonth = now.getMonth();
  
  // 월 제목 업데이트
  updateCalendarTitle();
  
  // 달력 다시 생성
  if (calendarContainer && notesDataWithIds.length > 0) {
    createCalendar(notesDataWithIds, currentCalendarYear, currentCalendarMonth).then(html => {
      calendarContainer.innerHTML = html;
    });
  }
}

// 오답노트 목록 표시
function displayNotesList(notesData) {
  if (!notesData || notesData.length === 0) {
    notesList.innerHTML = '<p class="no-notes">아직 작성한 오답노트가 없습니다.</p>';
    return;
  }
  
  // 날짜순으로 정렬 (최신순)
  notesData.sort((a, b) => {
    const dateA = new Date(a.data.activityYear, a.data.activityMonth - 1, a.data.activityDay);
    const dateB = new Date(b.data.activityYear, b.data.activityMonth - 1, b.data.activityDay);
    return dateB - dateA;
  });
  
  // 전역 변수에 저장
  notesDataWithIds = notesData;
  
  let notesHTML = '<div class="notes-grid">';
  notesData.forEach(({ id, data: note }) => {
    // 일기 내용 (있을 경우)
    const diaryPreview = note.diaryContent ? 
      `<div class="note-diary"><strong>일기:</strong> ${note.diaryContent.substring(0, 150)}${note.diaryContent.length > 150 ? '...' : ''}</div>` : '';
    
    // 문제 설명 (있을 경우)
    const problemExplanation = note.problemExplanation ? 
      `<div class="note-explanation"><strong>문제 설명:</strong> ${note.problemExplanation.substring(0, 150)}${note.problemExplanation.length > 150 ? '...' : ''}</div>` : '';
    
    // 문제 이미지 또는 텍스트
    let problemContent = '';
    if (note.problemData) {
      if (note.problemData.type === 'photo' && note.problemData.imageURL) {
        problemContent = `<div class="note-problem-image-container">
          <img src="${note.problemData.imageURL}" alt="문제 이미지" class="note-image-preview" 
               onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'200\\' height=\\'200\\'%3E%3Crect fill=\\'%23f5f5f5\\' width=\\'200\\' height=\\'200\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' text-anchor=\\'middle\\' dy=\\'.3em\\' fill=\\'%23999\\' font-family=\\'sans-serif\\' font-size=\\'14\\'%3E이미지를 불러올 수 없습니다%3C/text%3E%3C/svg%3E';" />
        </div>`;
      } else if (note.problemData.type === 'text' && note.problemData.content) {
        problemContent = `<div class="note-problem-text"><strong>문제:</strong> ${note.problemData.content.substring(0, 200)}${note.problemData.content.length > 200 ? '...' : ''}</div>`;
      } else if (note.problemData.type === 'draw' && note.problemData.imageURL) {
        problemContent = `<div class="note-problem-image-container">
          <img src="${note.problemData.imageURL}" alt="그린 문제" class="note-image-preview" 
               onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'200\\' height=\\'200\\'%3E%3Crect fill=\\'%23f5f5f5\\' width=\\'200\\' height=\\'200\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' text-anchor=\\'middle\\' dy=\\'.3em\\' fill=\\'%23999\\' font-family=\\'sans-serif\\' font-size=\\'14\\'%3E이미지를 불러올 수 없습니다%3C/text%3E%3C/svg%3E';" />
        </div>`;
      } else if (note.problemData.type === 'draw' && !note.problemData.imageURL) {
        // 그림 타입인데 이미지 URL이 없는 경우
        problemContent = `<div class="note-problem-text"><strong>문제:</strong> 그림이 저장되지 않았습니다.</div>`;
      }
    }
    
    notesHTML += `
      <div class="note-card" data-note-id="${id}" onclick="openNoteDetailModal('${id}')" style="cursor: pointer;">
        <div class="note-header">
          <span class="note-emotion">${note.emotion || '😊'}</span>
          <span class="note-date">${note.activityDate} ${note.activityTime}</span>
        </div>
        <div class="note-content">
          ${diaryPreview}
          ${problemContent}
          ${problemExplanation}
        </div>
        <div class="note-actions" onclick="event.stopPropagation();">
          <button class="btn-edit" onclick="editNote('${id}')">✏️ 수정</button>
          <button class="btn-delete" onclick="deleteNote('${id}')">🗑️ 삭제</button>
        </div>
      </div>
    `;
  });
  notesHTML += '</div>';
  
  notesList.innerHTML = notesHTML;
}

// 학생 데이터 로드
async function loadStudentData(userId) {
  if (!db) return;
  currentUserId = userId;
  
  try {
    // where와 orderBy를 함께 사용하면 복합 인덱스가 필요할 수 있으므로
    // 먼저 where로 필터링한 후 클라이언트에서 정렬
    const q = query(
      collection(db, 'studentNotes'),
      where('userId', '==', userId)
    );
    
    const querySnapshot = await getDocs(q);
    const notesData = [];
    
    querySnapshot.forEach((docSnapshot) => {
      notesData.push({
        id: docSnapshot.id,
        data: docSnapshot.data()
      });
    });
    
    // 클라이언트에서 날짜순으로 정렬 (최신순)
    notesData.sort((a, b) => {
      const dateA = new Date(a.data.timestamp);
      const dateB = new Date(b.data.timestamp);
      return dateB - dateA;
    });
    
    // 현재 달력 년/월 초기화
    const now = new Date();
    currentCalendarYear = now.getFullYear();
    currentCalendarMonth = now.getMonth();
    
    // 월 제목 업데이트
    updateCalendarTitle();
    
    // 달력 생성 (전체 데이터 전달 - id 포함)
    if (calendarContainer) {
      createCalendar(notesData, currentCalendarYear, currentCalendarMonth).then(html => {
        calendarContainer.innerHTML = html;
      });
    }
    
    // 오답노트 목록 표시
    displayNotesList(notesData);
  } catch (error) {
    console.error('학생 데이터 로드 실패:', error);
    if (error.code === 'failed-precondition') {
      console.warn('Firestore 인덱스가 필요할 수 있습니다. Firebase Console에서 인덱스를 생성해주세요.');
    }
  }
}

// 오답노트 삭제
window.deleteNote = async function(noteId) {
  if (!confirm('정말 이 오답노트를 삭제하시겠습니까?')) {
    return;
  }
  
  if (!db || !currentUserId) return;
  
  try {
    const noteRef = doc(db, 'studentNotes', noteId);
    await deleteDoc(noteRef);
    
    alert('오답노트가 삭제되었습니다.');
    
    // 데이터 다시 로드
    await loadStudentData(currentUserId);
  } catch (error) {
    console.error('삭제 실패:', error);
    alert('삭제 중 오류가 발생했습니다.');
  }
};

// 오답노트 수정
window.editNote = function(noteId) {
  const note = notesDataWithIds.find(item => item.id === noteId);
  if (!note) return;
  
  showEditModal(note);
};

// 달력에서 날짜 클릭 시 대표 이모티콘 선택 모달 표시
window.openCalendarEmotionModal = async function(dateKey, day, year, month) {
  // 해당 날짜의 모든 노트 찾기
  const dayNotes = notesDataWithIds.filter(item => {
    const note = item.data || item;
    const noteDate = parseInt(note.activityDay);
    const noteMonth = parseInt(note.activityMonth);
    const noteYear = parseInt(note.activityYear);
    return noteYear === year && noteMonth === month && noteDate === day;
  });
  
  if (dayNotes.length === 0) return;
  
  // 현재 대표 이모티콘 가져오기
  let currentRepresentativeEmotion = null;
  if (currentUserId && db) {
    try {
      const userRef = doc(db, 'users', currentUserId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const representativeEmotions = userSnap.data().representativeEmotions || {};
        currentRepresentativeEmotion = representativeEmotions[dateKey];
      }
    } catch (error) {
      console.error('대표 이모티콘 조회 실패:', error);
    }
  }
  
  // 현재 대표 이모티콘이 없으면 첫 번째 노트의 이모티콘 사용
  if (!currentRepresentativeEmotion && dayNotes.length > 0) {
    currentRepresentativeEmotion = dayNotes[0].data?.emotion || dayNotes[0].emotion;
  }
  
  // 해당 날짜의 모든 이모티콘 수집 (중복 제거)
  const uniqueEmotions = [...new Set(dayNotes.map(item => {
    const note = item.data || item;
    return note.emotion;
  }))];
  
  // 이모티콘 버튼 HTML 생성
  const emotionButtonsHTML = uniqueEmotions.map(emotion => 
    `<button class="emotion-select-btn-modal ${currentRepresentativeEmotion === emotion ? 'selected' : ''}" 
             data-emotion="${emotion}" 
             onclick="selectRepresentativeEmotion('${dateKey}', '${emotion}')">
      ${emotion}
    </button>`
  ).join('');
  
  // 모달 HTML 생성
  const modalHTML = `
    <div id="representative-emotion-modal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h2>대표 이모티콘 선택</h2>
          <button class="modal-close" onclick="closeRepresentativeEmotionModal()">&times;</button>
        </div>
        <div class="modal-body">
          <p class="modal-description">${year}년 ${month}월 ${day}일에 작성한 일기가 ${dayNotes.length}개 있습니다.<br>달력에 표시할 대표 이모티콘을 선택해주세요.</p>
          <div class="emotion-grid-modal">
            ${emotionButtonsHTML}
          </div>
          <div class="notes-preview">
            <h4>해당 날짜의 일기 목록</h4>
            <div class="notes-list-preview">
              ${dayNotes.map((item, index) => {
                const note = item.data || item;
                const time = note.activityTime || '';
                return `
                  <div class="note-preview-item ${currentRepresentativeEmotion === note.emotion ? 'selected' : ''}">
                    <span class="note-preview-emotion">${note.emotion}</span>
                    <span class="note-preview-time">${time}</span>
                    <span class="note-preview-content">${note.diaryContent ? note.diaryContent.substring(0, 50) + '...' : '일기 내용 없음'}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-cancel" onclick="closeRepresentativeEmotionModal()">닫기</button>
        </div>
      </div>
    </div>
  `;
  
  // 기존 모달 제거
  const existingModal = document.getElementById('representative-emotion-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // 모달 추가
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // 스크롤 방지
  document.body.style.overflow = 'hidden';
  
  // 모달 외부 클릭 시 닫기
  const modal = document.getElementById('representative-emotion-modal');
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        closeRepresentativeEmotionModal();
      }
    });
  }
};

// 대표 이모티콘 선택
window.selectRepresentativeEmotion = async function(dateKey, emotion) {
  if (!currentUserId || !db) {
    alert('로그인이 필요합니다.');
    return;
  }
  
  try {
    const userRef = doc(db, 'users', currentUserId);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      alert('사용자 정보를 찾을 수 없습니다.');
      return;
    }
    
    const currentData = userSnap.data();
    const representativeEmotions = currentData.representativeEmotions || {};
    representativeEmotions[dateKey] = emotion;
    
    await updateDoc(userRef, {
      representativeEmotions: representativeEmotions,
      updatedAt: new Date().toISOString()
    });
    
    // 모달 닫기
    closeRepresentativeEmotionModal();
    
    // 달력 다시 로드
    await loadStudentData(currentUserId);
    
    alert('대표 이모티콘이 저장되었습니다!');
  } catch (error) {
    console.error('대표 이모티콘 저장 실패:', error);
    alert('대표 이모티콘 저장 중 오류가 발생했습니다.');
  }
};

// 대표 이모티콘 모달 닫기
window.closeRepresentativeEmotionModal = function() {
  const modal = document.getElementById('representative-emotion-modal');
  if (modal) {
    modal.remove();
    document.body.style.overflow = '';
  }
};

// 달력에서 날짜 클릭 시 노트 수정 모달 표시 (기존 기능 유지)
window.openCalendarNoteModal = function(noteId, day) {
  const note = notesDataWithIds.find(item => item.id === noteId);
  if (!note) return;
  showEditModal(note);
};

// 수정 모달 표시
function showEditModal({ id, data: note }) {
  // 사용 가능한 모든 이모티콘 목록
  const allEmotions = [
    '😊', '😄', '😁', '🥳', '😍', '🤩', '😎', '🙌', '✨', '🌟',
    '😢', '😰', '😞', '😓', '😔', '😣', '😫', '😩', '😭', '😤',
    '🤢', '😱', '😡', '🎯', '💪', '🔥', '⚡', '🚀', '🏆', '💯',
    '⭐', '💫', '🌈', '📚', '📖', '✏️', '📝', '💡', '🧠', '🤔',
    '🧐', '📊', '📈', '😌', '😐', '😶', '😑', '🤨', '😮', '😯',
    '😴', '😅', '🤷', '😷', '🤧', '🤒', '❤️'
  ];
  
  // 이모티콘 버튼 HTML 생성
  const emotionButtonsHTML = allEmotions.map(emotion => 
    `<button class="emotion-btn-edit ${note.emotion === emotion ? 'selected' : ''}" data-emotion="${emotion}">${emotion}</button>`
  ).join('');
  
  // 모달 HTML 생성
  const modalHTML = `
    <div id="edit-modal" class="modal">
      <div class="modal-content modal-content-large">
        <div class="modal-header">
          <h2>일기 수정</h2>
          <button class="modal-close" onclick="closeEditModal()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>감정 이모티콘</label>
            <div class="emotion-grid-edit" id="emotion-grid-edit">
              ${emotionButtonsHTML}
            </div>
          </div>
          <div class="form-group">
            <label>일기 내용</label>
            <textarea id="edit-diary" class="edit-textarea" rows="8">${note.diaryContent || ''}</textarea>
          </div>
          <div class="form-group">
            <label>문제 설명</label>
            <textarea id="edit-explanation" class="edit-textarea" rows="6">${note.problemExplanation || ''}</textarea>
          </div>
          ${note.problemData && note.problemData.imageURL && (note.problemData.type === 'photo' || note.problemData.type === 'draw') ? `
            <div class="form-group">
              <label>문제 이미지</label>
              <img src="${note.problemData.imageURL}" alt="문제 이미지" class="edit-image-preview" 
                   onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'200\\' height=\\'200\\'%3E%3Crect fill=\\'%23f5f5f5\\' width=\\'200\\' height=\\'200\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' text-anchor=\\'middle\\' dy=\\'.3em\\' fill=\\'%23999\\' font-family=\\'sans-serif\\' font-size=\\'14\\'%3E이미지를 불러올 수 없습니다%3C/text%3E%3C/svg%3E';" />
            </div>
          ` : ''}
          ${note.problemData && note.problemData.type === 'text' ? `
            <div class="form-group">
              <label>문제 텍스트</label>
              <textarea id="edit-problem-text" class="edit-textarea" rows="4" readonly>${note.problemData.content || ''}</textarea>
            </div>
          ` : ''}
        </div>
        <div class="modal-footer">
          <button class="btn btn-cancel" onclick="closeEditModal()">취소</button>
          <button class="btn btn-save" onclick="saveNoteEdit('${id}')">저장</button>
        </div>
      </div>
    </div>
  `;
  
  // 기존 모달 제거
  const existingModal = document.getElementById('edit-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // 모달 추가
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // 모달 외부 클릭 시 닫기
  const modal = document.getElementById('edit-modal');
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        closeEditModal();
      }
    });
    
    // ESC 키로 닫기 (한 번만 등록)
    const escapeHandler = function(e) {
      if (e.key === 'Escape') {
        closeEditModal();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);
  }
  
  // 이모티콘 선택 이벤트
  const emotionButtons = document.querySelectorAll('.emotion-btn-edit');
  emotionButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      emotionButtons.forEach(b => b.classList.remove('selected'));
      this.classList.add('selected');
    });
  });
  
  // 스크롤 방지
  document.body.style.overflow = 'hidden';
}

// 모달 닫기
window.closeEditModal = function() {
  const modal = document.getElementById('edit-modal');
  if (modal) {
    modal.remove();
    // 스크롤 복원
    document.body.style.overflow = '';
  }
};

// 노트 상세 보기 모달 열기
window.openNoteDetailModal = function(noteId) {
  if (!db) return;
  
  // 노트 데이터 찾기
  const noteData = notesDataWithIds.find(item => item.id === noteId);
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
            const role = msg.role === 'user' ? '사용자' : '선생님';
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
  
  // 모달 HTML 생성
  const modalHTML = `
    <div id="note-detail-modal" class="modal">
      <div class="modal-content modal-content-large">
        <div class="modal-header">
          <h2>📝 오답노트 상세보기</h2>
          <button class="modal-close" onclick="closeNoteDetailModal()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>날짜 및 시간</label>
            <div class="detail-info">${note.activityDate} ${note.activityTime}</div>
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
          ${chatHistoryHTML}
          ${note.feedback ? `
            <div class="form-group feedback-display-section">
              <label>💬 선생님 피드백</label>
              <div class="teacher-feedback-content">
                <div class="detail-text-content">${note.feedback.replace(/\n/g, '<br>')}</div>
                ${note.receivedPieToken ? '<div class="pie-token-received">🥧 파이 토큰 1개를 받았습니다!</div>' : ''}
              </div>
            </div>
          ` : ''}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="openEditFromDetail('${noteId}')">✏️ 수정</button>
          <button class="btn btn-cancel" onclick="closeNoteDetailModal()">닫기</button>
        </div>
      </div>
    </div>
  `;
  
  // 기존 모달 제거
  const existingModal = document.getElementById('note-detail-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // 모달 추가
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // 모달 외부 클릭 시 닫기
  const modal = document.getElementById('note-detail-modal');
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        closeNoteDetailModal();
      }
    });
    
    // ESC 키로 닫기
    const escapeHandler = function(e) {
      if (e.key === 'Escape') {
        closeNoteDetailModal();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);
  }
  
  // 스크롤 방지
  document.body.style.overflow = 'hidden';
};

// 노트 상세 보기 모달 닫기
window.closeNoteDetailModal = function() {
  const modal = document.getElementById('note-detail-modal');
  if (modal) {
    modal.remove();
    // 스크롤 복원
    document.body.style.overflow = '';
  }
};

// 상세 보기 모달에서 수정 모달로 전환
window.openEditFromDetail = function(noteId) {
  closeNoteDetailModal();
  // 약간의 지연을 두어 모달이 완전히 닫힌 후 수정 모달 열기
  setTimeout(() => {
    const noteData = notesDataWithIds.find(item => item.id === noteId);
    if (noteData) {
      showEditModal(noteData);
    }
  }, 100);
};

// 수정 저장
window.saveNoteEdit = async function(noteId) {
  if (!db) return;
  
  const selectedEmotionBtn = document.querySelector('.emotion-btn-edit.selected');
  const newEmotion = selectedEmotionBtn ? selectedEmotionBtn.dataset.emotion : null;
  const newDiary = document.getElementById('edit-diary') ? document.getElementById('edit-diary').value.trim() : '';
  const newExplanation = document.getElementById('edit-explanation') ? document.getElementById('edit-explanation').value.trim() : '';
  
  if (!newEmotion) {
    alert('감정 이모티콘을 선택해주세요.');
    return;
  }
  
  if (!newDiary) {
    alert('일기 내용을 입력해주세요.');
    return;
  }
  
  try {
    const noteRef = doc(db, 'studentNotes', noteId);
    const updateData = {
      emotion: newEmotion,
      diaryContent: newDiary
    };
    
    if (newExplanation) {
      updateData.problemExplanation = newExplanation;
    }
    
    await updateDoc(noteRef, updateData);
    
    alert('일기가 수정되었습니다.');
    closeEditModal();
    
    // 데이터 다시 로드
    if (currentUserId) {
      await loadStudentData(currentUserId);
    }
  } catch (error) {
    console.error('수정 실패:', error);
    alert('수정 중 오류가 발생했습니다.');
  }
};

// 사용자 정보 확인 및 저장
async function checkAndSaveUserInfo(user) {
  if (!db) return null;
  
  try {
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      // 이미 정보가 있으면 반환
      return userSnap.data();
    } else {
      // 정보가 없으면 입력 모달 표시
      return await showUserInfoModal(user);
    }
  } catch (error) {
    console.error('사용자 정보 확인 실패:', error);
    return null;
  }
}

// 사용자 정보 입력 모달 표시
function showUserInfoModal(user) {
  return new Promise((resolve) => {
    const modalHTML = `
      <div id="user-info-modal" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2>학생 정보 입력</h2>
          </div>
          <div class="modal-body">
            <p class="modal-description">처음 로그인하시는군요! 학번과 이름을 입력해주세요.</p>
            <div class="form-group">
              <label>이메일 (아이디)</label>
              <input type="email" id="user-email" class="form-input" value="${user.email}" readonly />
            </div>
            <div class="form-group">
              <label>학번 <span class="required">*</span></label>
              <input type="text" id="user-student-id" class="form-input" placeholder="학번을 입력하세요 (예: 30901)" maxlength="5" pattern="[0-9]{5}" />
            </div>
            <div class="form-group">
              <label>이름 <span class="required">*</span></label>
              <input type="text" id="user-name" class="form-input" placeholder="이름을 입력하세요" value="${user.displayName || ''}" maxlength="20" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-save" onclick="saveUserInfo('${user.uid}')">저장</button>
          </div>
        </div>
      </div>
    `;
    
    // 기존 모달 제거
    const existingModal = document.getElementById('user-info-modal');
    if (existingModal) {
      existingModal.remove();
    }
    
    // 모달 추가
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // 스크롤 방지
    document.body.style.overflow = 'hidden';
    
    // 저장 함수를 전역으로 등록
    window.saveUserInfo = async function(userId) {
      const studentId = document.getElementById('user-student-id').value.trim();
      const userName = document.getElementById('user-name').value.trim();
      
      if (!studentId) {
        alert('학번을 입력해주세요.');
        return;
      }
      
      // 학번 형식 검증 (5자리 숫자, 0으로 시작 가능)
      if (studentId.length !== 5 || !/^\d{5}$/.test(studentId)) {
        alert('학번은 5자리 숫자로 입력해주세요. (예: 30901 또는 04152)');
        return;
      }
      
      if (!userName) {
        alert('이름을 입력해주세요.');
        return;
      }
      
      // 학번 파싱 (학년, 반, 번호)
      const parsedId = parseStudentId(studentId);
      if (!parsedId) {
        alert('학번 형식이 올바르지 않습니다. 5자리 숫자로 입력해주세요.');
        return;
      }
      
      try {
        const userRef = doc(db, 'users', userId);
        await setDoc(userRef, {
          email: user.email,
          studentId: studentId,
          grade: parsedId.grade, // 학년
          classNum: parsedId.classNum, // 반
          number: parsedId.number, // 번호
          name: userName,
          displayName: user.displayName || userName,
          pieTokens: 0, // 파이 토큰 초기값
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        
        closeUserInfoModal();
        const userData = { email: user.email, studentId, name: userName };
        resolve(userData);
        
        // UI 다시 업데이트
        if (auth) {
          const currentUser = auth.currentUser;
          if (currentUser) {
            updateUI(currentUser);
          }
        }
      } catch (error) {
        console.error('사용자 정보 저장 실패:', error);
        alert('정보 저장 중 오류가 발생했습니다.');
        resolve(null);
      }
    };
  });
}

// 사용자 정보 모달 닫기
function closeUserInfoModal() {
  const modal = document.getElementById('user-info-modal');
  if (modal) {
    modal.remove();
    document.body.style.overflow = '';
  }
}

// 개인정보 수정 모달 열기
window.openEditProfileModal = async function() {
  if (!currentUserId || !db) {
    alert('로그인이 필요합니다.');
    return;
  }
  
  try {
    // 현재 사용자 정보 가져오기
    const userRef = doc(db, 'users', currentUserId);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      alert('사용자 정보를 찾을 수 없습니다.');
      return;
    }
    
    const userData = userSnap.data();
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
      alert('로그인 정보를 찾을 수 없습니다.');
      return;
    }
    
    const modalHTML = `
      <div id="edit-profile-modal" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2>개인정보 수정</h2>
            <button class="modal-close" onclick="closeEditProfileModal()">&times;</button>
          </div>
          <div class="modal-body">
            <p class="modal-description">이름과 학번을 수정할 수 있습니다.</p>
            <div class="form-group">
              <label>이메일 (아이디)</label>
              <input type="email" id="edit-user-email" class="form-input" value="${currentUser.email}" readonly />
            </div>
            <div class="form-group">
              <label>학번 <span class="required">*</span></label>
              <input type="text" id="edit-user-student-id" class="form-input" placeholder="학번을 입력하세요 (예: 30901)" value="${userData.studentId || ''}" maxlength="5" pattern="[0-9]{5}" />
            </div>
            <div class="form-group">
              <label>이름 <span class="required">*</span></label>
              <input type="text" id="edit-user-name" class="form-input" placeholder="이름을 입력하세요" value="${userData.name || ''}" maxlength="20" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-cancel" onclick="closeEditProfileModal()">취소</button>
            <button class="btn btn-save" onclick="saveProfileEdit()">저장</button>
          </div>
        </div>
      </div>
    `;
    
    // 기존 모달 제거
    const existingModal = document.getElementById('edit-profile-modal');
    if (existingModal) {
      existingModal.remove();
    }
    
    // 모달 추가
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // 스크롤 방지
    document.body.style.overflow = 'hidden';
    
    // 모달 외부 클릭 시 닫기
    const modal = document.getElementById('edit-profile-modal');
    if (modal) {
      modal.addEventListener('click', function(e) {
        if (e.target === modal) {
          closeEditProfileModal();
        }
      });
      
      // ESC 키로 닫기
      const escapeHandler = function(e) {
        if (e.key === 'Escape') {
          closeEditProfileModal();
          document.removeEventListener('keydown', escapeHandler);
        }
      };
      document.addEventListener('keydown', escapeHandler);
    }
  } catch (error) {
    console.error('개인정보 수정 모달 열기 실패:', error);
    alert('개인정보 수정 모달을 열 수 없습니다.');
  }
};

// 개인정보 수정 모달 닫기
window.closeEditProfileModal = function() {
  const modal = document.getElementById('edit-profile-modal');
  if (modal) {
    modal.remove();
    document.body.style.overflow = '';
  }
};

// 개인정보 수정 저장
window.saveProfileEdit = async function() {
  if (!currentUserId || !db) {
    alert('로그인이 필요합니다.');
    return;
  }
  
  const studentId = document.getElementById('edit-user-student-id').value.trim();
  const userName = document.getElementById('edit-user-name').value.trim();
  
  if (!studentId) {
    alert('학번을 입력해주세요.');
    return;
  }
  
  // 학번 형식 검증 (5자리 숫자, 0으로 시작 가능)
  if (studentId.length !== 5 || !/^\d{5}$/.test(studentId)) {
    alert('학번은 5자리 숫자로 입력해주세요. (예: 30901 또는 04152)');
    return;
  }
  
  if (!userName) {
    alert('이름을 입력해주세요.');
    return;
  }
  
  // 학번 파싱 (학년, 반, 번호)
  const parsedId = parseStudentId(studentId);
  if (!parsedId) {
    alert('학번 형식이 올바르지 않습니다. 5자리 숫자로 입력해주세요.');
    return;
  }
  
  try {
    const userRef = doc(db, 'users', currentUserId);
    const userSnap = await getDoc(userRef);
    const currentData = userSnap.data();
    
    await updateDoc(userRef, {
      studentId: studentId,
      grade: parsedId.grade, // 학년
      classNum: parsedId.classNum, // 반
      number: parsedId.number, // 번호
      name: userName,
      displayName: userName,
      updatedAt: new Date().toISOString()
    });
    
    closeEditProfileModal();
    
    // UI 다시 업데이트
    const currentUser = auth.currentUser;
    if (currentUser) {
      await updateUI(currentUser);
    }
    
    alert('개인정보가 수정되었습니다!');
  } catch (error) {
    console.error('개인정보 수정 실패:', error);
    alert('개인정보 수정 중 오류가 발생했습니다.');
  }
};

// UI 업데이트
async function updateUI(user) {
  if (user) {
    // 로그인된 상태
    loginSection.style.display = 'none';
    menuSection.style.display = 'block';
    
    const email = user.email;
    const uid = user.uid;
    const isAdminUser = isAdmin(uid);
    const isTeacherUser = isAdminUser || isTeacher(email); // 관리자 또는 교사 이메일
    
    // 사용자 정보 확인 및 저장 (학생만)
    let userInfoData = null;
    if (!isTeacherUser) {
      userInfoData = await checkAndSaveUserInfo(user);
    }
    
    // 사용자 정보 표시
    const displayName = userInfoData?.name || user.displayName || email;
    
    // 파이 토큰 표시 (학생만)
    const pieTokens = !isTeacherUser ? (userInfoData?.pieTokens ?? 0) : null;
    
    // 버튼 그룹 HTML 생성
    let buttonsHTML = '';
    if (!isTeacherUser) {
      buttonsHTML = `
        <div class="user-info-buttons">
          <a href="student.html" class="btn btn-student">
            <span class="icon">📝</span>
            <span>일기쓰기</span>
          </a>
          <button class="btn btn-feedback" onclick="openFeedbackViewModal()">
            <span class="icon">💬</span>
            <span>피드백 보기</span>
          </button>
          <button class="btn btn-edit-profile" onclick="openEditProfileModal()">
            <span class="icon">🪪</span>
            <span>개인정보 수정</span>
          </button>
          <button id="logout-btn" class="btn btn-logout">
            <span class="icon">🚪</span>
            <span>로그아웃</span>
          </button>
        </div>
      `;
    } else {
      // 관리자(교사)인 경우에만 교사 모니터링 버튼 표시
      buttonsHTML = `
        <div class="user-info-buttons">
          <a href="student.html" class="btn btn-student">
            <span class="icon">📝</span>
            <span>일기쓰기</span>
          </a>
          ${isAdminUser ? `
          <a href="teacherMonitor.html" class="btn btn-teacher">
            <span class="icon">👩‍🏫</span>
            <span>교사 모니터링</span>
          </a>
          <button id="test-student-view-btn" class="btn btn-test-student">
            <span class="icon">👁️</span>
            <span>학생 화면 테스트</span>
          </button>
          ` : ''}
          <button id="logout-btn" class="btn btn-logout">
            <span class="icon">🚪</span>
            <span>로그아웃</span>
          </button>
        </div>
      `;
    }
    
    userInfo.innerHTML = `
      <div class="user-info-content">
        <p><strong>${displayName}</strong>님 환영합니다!</p>
        ${userInfoData?.studentId ? `<p class="user-student-id">학번: ${userInfoData.studentId}</p>` : ''}
        <p class="user-role">${isTeacherUser ? '👩‍🏫 교사' : '👩🏻 학생'}</p>
        ${pieTokens !== null ? `
          <div class="pie-token-badge-inline">
            <span class="pie-icon">🥧</span>
            <span class="pie-count">${pieTokens} 파이</span>
          </div>
        ` : ''}
      </div>
      ${buttonsHTML}
    `;
    
    // 로그아웃 버튼 이벤트 리스너 다시 연결
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', handleLogout);
    }
    
    // 학생 대시보드 표시/숨김
    if (studentDashboard) {
      // URL 쿼리 파라미터로 학생 화면 테스트 모드 확인
      const urlParams = new URLSearchParams(window.location.search);
      const isTestMode = urlParams.get('test') === 'student';
      
      if (isTeacherUser && !isTestMode) {
        // 교사이고 테스트 모드가 아닌 경우 대시보드 숨김
        studentDashboard.style.display = 'none';
      } else {
        // 학생이거나 테스트 모드인 경우 대시보드 표시
        studentDashboard.style.display = 'block';
        // 달력 네비게이션 버튼 이벤트 설정
        setTimeout(() => {
          setupCalendarNavigation();
        }, 100);
        // 학생 데이터 로드 (테스트 모드인 경우 교사 UID로 로드)
        const targetUserId = isTestMode && isAdminUser ? user.uid : (isTeacherUser ? null : user.uid);
        if (targetUserId) {
          loadStudentData(targetUserId);
        }
      }
    }
    
    // 학생 화면 테스트 버튼 이벤트 리스너
    const testStudentViewBtn = document.getElementById('test-student-view-btn');
    if (testStudentViewBtn) {
      testStudentViewBtn.addEventListener('click', function() {
        // 쿼리 파라미터 추가하여 학생 화면 테스트 모드로 전환
        const url = new URL(window.location.href);
        url.searchParams.set('test', 'student');
        window.location.href = url.toString();
      });
    }
    
    // 테스트 모드에서 나가기 버튼 추가
    const urlParams = new URLSearchParams(window.location.search);
    const isTestMode = urlParams.get('test') === 'student';
    if (isTestMode && isAdminUser && userInfo) {
      const exitTestBtn = document.createElement('button');
      exitTestBtn.className = 'btn btn-exit-test';
      exitTestBtn.innerHTML = '<span class="icon">↩️</span><span>테스트 모드 나가기</span>';
      exitTestBtn.style.marginTop = '1rem';
      exitTestBtn.style.width = '100%';
      exitTestBtn.addEventListener('click', function() {
        const url = new URL(window.location.href);
        url.searchParams.delete('test');
        window.location.href = url.toString();
      });
      userInfo.appendChild(exitTestBtn);
    }
  } else {
    // 로그인되지 않은 상태
    loginSection.style.display = 'block';
    menuSection.style.display = 'none';
    if (studentDashboard) {
      studentDashboard.style.display = 'none';
    }
  }
}

// 피드백 보기 모달 열기
window.openFeedbackViewModal = async function() {
  if (!currentUserId || !db) {
    alert('로그인이 필요합니다.');
    return;
  }
  
  try {
    // 피드백이 있는 일기 불러오기
    const q = query(
      collection(db, 'studentNotes'),
      where('userId', '==', currentUserId)
    );
    
    const querySnapshot = await getDocs(q);
    const feedbackNotes = [];
    
    querySnapshot.forEach((docSnapshot) => {
      const noteData = docSnapshot.data();
      // 피드백이 있는 일기만 필터링
      if (noteData.feedback && noteData.feedback.trim().length > 0) {
        feedbackNotes.push({
          id: docSnapshot.id,
          data: noteData
        });
      }
    });
    
    // 날짜순으로 정렬 (최신순)
    feedbackNotes.sort((a, b) => {
      const dateA = a.data.timestamp ? new Date(a.data.timestamp).getTime() : 0;
      const dateB = b.data.timestamp ? new Date(b.data.timestamp).getTime() : 0;
      return dateB - dateA;
    });
    
    // 모달 HTML 생성
    let feedbackListHTML = '';
    if (feedbackNotes.length === 0) {
      feedbackListHTML = '<p class="empty-text">아직 받은 피드백이 없습니다.</p>';
    } else {
      feedbackNotes.forEach(({ id, data: note }) => {
        const date = note.activityDate || '날짜 없음';
        const time = note.activityTime || '';
        const emotion = note.emotion || '😊';
        const feedback = note.feedback || '';
        const receivedPieToken = note.receivedPieToken || false;
        
        feedbackListHTML += `
          <div class="feedback-item">
            <div class="feedback-item-header">
              <span class="feedback-emotion">${emotion}</span>
              <div class="feedback-item-info">
                <span class="feedback-date">${date} ${time}</span>
                ${receivedPieToken ? '<span class="pie-token-badge">🥧 파이 토큰</span>' : ''}
              </div>
            </div>
            <div class="feedback-content">
              <div class="feedback-text">${feedback.replace(/\n/g, '<br>')}</div>
            </div>
          </div>
        `;
      });
    }
    
    const modalHTML = `
      <div id="feedback-view-modal" class="modal">
        <div class="modal-content modal-content-large">
          <div class="modal-header">
            <h2>💬 선생님 피드백</h2>
            <button class="modal-close" onclick="closeFeedbackViewModal()">&times;</button>
          </div>
          <div class="modal-body">
            <div class="feedback-list-container">
              ${feedbackListHTML}
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-cancel" onclick="closeFeedbackViewModal()">닫기</button>
          </div>
        </div>
      </div>
    `;
    
    // 기존 모달 제거
    const existingModal = document.getElementById('feedback-view-modal');
    if (existingModal) {
      existingModal.remove();
    }
    
    // 모달 추가
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // 모달 외부 클릭 시 닫기
    const modal = document.getElementById('feedback-view-modal');
    if (modal) {
      modal.addEventListener('click', function(e) {
        if (e.target === modal) {
          closeFeedbackViewModal();
        }
      });
      
      // ESC 키로 닫기
      const escapeHandler = function(e) {
        if (e.key === 'Escape') {
          closeFeedbackViewModal();
          document.removeEventListener('keydown', escapeHandler);
        }
      };
      document.addEventListener('keydown', escapeHandler);
    }
    
    // 스크롤 방지
    document.body.style.overflow = 'hidden';
    
  } catch (error) {
    console.error('피드백 불러오기 실패:', error);
    alert('피드백을 불러오는 중 오류가 발생했습니다.');
  }
};

// 피드백 보기 모달 닫기
window.closeFeedbackViewModal = function() {
  const modal = document.getElementById('feedback-view-modal');
  if (modal) {
    modal.remove();
    document.body.style.overflow = '';
  }
};

// 테스트 모드: 특정 날짜의 일기 작성 팝업 열기
window.openDiaryForDate = function(dateKey, year, month, day) {
  // 테스트 모드인지 확인
  const urlParams = new URLSearchParams(window.location.search);
  const isTestMode = urlParams.get('test') === 'student';
  
  if (isTestMode) {
    // 테스트 모드: 팝업으로 일기 작성 (모든 날짜 허용)
    openDiaryModal(dateKey, year, month, day);
  } else {
    // 일반 모드: 오늘 날짜인지 확인
    const today = new Date();
    const selectedDate = new Date(year, month - 1, day);
    const isToday = today.getFullYear() === year && 
                    today.getMonth() === month - 1 && 
                    today.getDate() === day;
    
    if (!isToday) {
      // 오늘 날짜가 아니면 일기 작성 불가
      alert('오늘 날짜에만 일기를 작성할 수 있습니다.');
      return;
    }
    
    // 오늘 날짜: student.html로 이동
    const url = new URL('student.html', window.location.origin);
    url.searchParams.set('date', dateKey);
    url.searchParams.set('year', year);
    url.searchParams.set('month', month);
    url.searchParams.set('day', day);
    window.location.href = url.toString();
  }
};

// 일기 작성 모달 열기 (테스트 모드 전용)
function openDiaryModal(dateKey, year, month, day) {
  // 모달 HTML 생성
  const modalHTML = `
    <div id="diary-modal" class="modal">
      <div class="modal-content modal-content-large" style="max-width: 900px; max-height: 95vh;">
        <div class="modal-header">
          <h2>📝 일기 작성</h2>
          <button class="modal-close" onclick="closeDiaryModal()">&times;</button>
        </div>
        <div class="modal-body" style="padding: 0;">
          <iframe 
            id="diary-iframe" 
            src="student.html?date=${dateKey}&year=${year}&month=${month}&day=${day}&test=student&modal=true"
            style="width: 100%; height: 80vh; border: none;"
          ></iframe>
        </div>
      </div>
    </div>
  `;
  
  // 기존 모달 제거
  const existingModal = document.getElementById('diary-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // 모달 추가
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // 모달 외부 클릭 시 닫기
  const modal = document.getElementById('diary-modal');
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        closeDiaryModal();
      }
    });
    
    // ESC 키로 닫기
    const escapeHandler = function(e) {
      if (e.key === 'Escape') {
        closeDiaryModal();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);
  }
  
  // 스크롤 방지
  document.body.style.overflow = 'hidden';
  
  // iframe에서 제출 완료 메시지 받기
  window.addEventListener('message', function(event) {
    if (event.data === 'diary-submitted') {
      closeDiaryModal();
      // 달력 새로고침
      if (currentUserId) {
        loadStudentData(currentUserId);
      }
    }
  });
}

// 일기 작성 모달 닫기
window.closeDiaryModal = function() {
  const modal = document.getElementById('diary-modal');
  if (modal) {
    modal.remove();
    // 스크롤 복원
    document.body.style.overflow = '';
  }
};

// 이벤트 리스너
if (loginButton) {
  loginButton.addEventListener('click', handleGoogleLogin);
}

// 로그아웃 버튼은 동적으로 생성되므로 이벤트 위임 사용
document.addEventListener('click', function(e) {
  if (e.target.closest('#logout-btn')) {
    handleLogout();
  }
});

// 달력 네비게이션 버튼 이벤트 설정
function setupCalendarNavigation() {
  const prevMonthBtn = document.getElementById('prev-month-btn');
  const nextMonthBtn = document.getElementById('next-month-btn');
  const todayBtn = document.getElementById('today-btn');
  
  if (prevMonthBtn && !prevMonthBtn.dataset.listenerAdded) {
    prevMonthBtn.addEventListener('click', () => {
      updateCalendarMonth('prev');
    });
    prevMonthBtn.dataset.listenerAdded = 'true';
  }
  
  if (nextMonthBtn && !nextMonthBtn.dataset.listenerAdded) {
    nextMonthBtn.addEventListener('click', () => {
      updateCalendarMonth('next');
    });
    nextMonthBtn.dataset.listenerAdded = 'true';
  }
  
  if (todayBtn && !todayBtn.dataset.listenerAdded) {
    todayBtn.addEventListener('click', () => {
      goToToday();
    });
    todayBtn.dataset.listenerAdded = 'true';
  }
}

// 인증 상태 변화 감지
if (auth) {
  onAuthStateChanged(auth, (user) => {
    updateUI(user);
  });
} else {
  // Firebase 초기화 실패 시 로그인 섹션만 표시
  console.error('Firebase 인증을 초기화할 수 없습니다.');
  if (loginSection) {
    loginSection.style.display = 'block';
  }
  if (menuSection) {
    menuSection.style.display = 'none';
  }
}

