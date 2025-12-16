import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, collection, query, where, getDocs, doc, getDoc, updateDoc, increment } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { firebaseConfig, adminUids, isFirebaseConfigValid } from './firebaseConfig.js';

// ChatGPT API Key (환경변수에서 가져오기)
const CHATGPT_API_KEY = import.meta.env.VITE_CHATGPT_API_KEY;

// 관리자 확인 함수
function isAdmin(uid) {
  if (!adminUids || adminUids.length === 0) {
    return false;
  }
  return adminUids.includes(uid);
}

// Firebase 초기화
let app;
let auth;
let db;

if (!isFirebaseConfigValid()) {
  console.error('Firebase 설정이 완전하지 않습니다.');
  const container = document.getElementById('student-info-section');
  if (container) {
    container.innerHTML = '<p class="error-text">Firebase 설정에 오류가 있습니다. .env 파일을 확인해주세요.</p>';
  }
} else {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    console.log('✅ Firebase 초기화 성공');
  } catch (error) {
    console.error('❌ Firebase 초기화 실패:', error);
    const container = document.getElementById('student-info-section');
    if (container) {
      container.innerHTML = `<p class="error-text">Firebase 초기화에 실패했습니다.<br>${error.message || '알 수 없는 오류'}</p>`;
    }
  }
}

// URL 파라미터에서 userId 가져오기
const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('userId');

// 뒤로가기 함수
window.goBack = function() {
  window.location.href = 'teacherMonitor.html';
};

// 관리자 확인 및 데이터 로드
if (auth && db) {
  onAuthStateChanged(auth, (user) => {
    // 비동기 함수를 즉시 실행 함수로 감싸서 에러 처리
    (async () => {
      try {
        if (!user) {
          alert('로그인이 필요합니다.');
          window.location.href = 'index.html';
          return;
        }
        
        console.log('현재 사용자:', user.uid);
        console.log('관리자 UID 목록:', adminUids);
        
        if (!isAdmin(user.uid)) {
          alert('접근 권한이 없습니다.');
          window.location.href = 'index.html';
          return;
        }
        
        if (!userId) {
          alert('학생 ID가 없습니다.');
          window.location.href = 'teacherMonitor.html';
          return;
        }
        
        console.log('학생 ID:', userId);
        
        // 학생 정보 및 일기 목록 로드
        await loadStudentDetail(userId);
      } catch (error) {
        console.error('인증 상태 확인 중 오류:', error);
        console.error('에러 상세:', {
          message: error.message,
          code: error.code,
          stack: error.stack,
          name: error.name
        });
        const container = document.getElementById('student-info-section');
        if (container) {
          container.innerHTML = `<p class="error-text">인증 확인 중 오류가 발생했습니다.<br>${error.message || '알 수 없는 오류'}<br>에러 코드: ${error.code || 'N/A'}</p>`;
        }
      }
    })();
  });
} else {
  console.error('Firebase가 초기화되지 않았습니다.');
  const container = document.getElementById('student-info-section');
  if (container) {
    container.innerHTML = '<p class="error-text">Firebase가 초기화되지 않았습니다. .env 파일을 확인해주세요.</p>';
  }
}

// 학생 상세 정보 로드
async function loadStudentDetail(userId) {
  console.log('loadStudentDetail 시작, userId:', userId);
  
  if (!db) {
    console.error('Firestore가 초기화되지 않았습니다.');
    const container = document.getElementById('student-info-section');
    if (container) {
      container.innerHTML = '<p class="error-text">Firestore가 초기화되지 않았습니다.</p>';
    }
    return;
  }
  
  try {
    console.log('사용자 정보 조회 시작...');
    // 사용자 정보 가져오기 (문서 ID로 직접 조회)
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    let userInfo = null;
    if (userSnap.exists()) {
      userInfo = { id: userSnap.id, ...userSnap.data() };
      console.log('사용자 정보 조회 성공:', userInfo);
    } else {
      console.warn('사용자 정보를 찾을 수 없습니다. userId:', userId);
      console.warn('문서 존재 여부:', userSnap.exists());
    }
    
    console.log('일기 목록 조회 시작...');
    // 학생의 모든 일기 가져오기
    // 인덱스 오류를 피하기 위해 orderBy 없이 쿼리하고 클라이언트에서 정렬
    const notesCollection = collection(db, 'studentNotes');
    const notesQuery = query(
      notesCollection,
      where('userId', '==', userId)
    );
    
    console.log('일기 쿼리 실행 중...');
    const notesSnapshot = await getDocs(notesQuery);
    console.log('일기 문서 수:', notesSnapshot.size);
    
    const notes = [];
    notesSnapshot.forEach((docSnapshot) => {
      const noteData = docSnapshot.data();
      // 테스트 모드 데이터 제외
      if (!isTestModeData(noteData)) {
        notes.push({
          id: docSnapshot.id,
          data: noteData
        });
      }
    });
    
    console.log('필터링된 일기 수:', notes.length);
    
    // timestamp 기준으로 클라이언트에서 정렬 (최신순)
    notes.sort((a, b) => {
      const dateA = a.data.timestamp ? new Date(a.data.timestamp).getTime() : 0;
      const dateB = b.data.timestamp ? new Date(b.data.timestamp).getTime() : 0;
      return dateB - dateA;
    });
    
    // 전역 변수에 노트 데이터 저장 (피드백 창에서 사용)
    window.studentNotesData = notes;
    
    // 학생 정보 표시
    displayStudentInfo(userInfo, notes);
    
    // 일기 목록 표시
    displayStudentNotes(notes);
    
    console.log('학생 상세 정보 로드 완료');
    
  } catch (error) {
    console.error('학생 상세 정보 로드 실패:', error);
    console.error('에러 상세:', {
      message: error.message,
      code: error.code,
      stack: error.stack,
      name: error.name
    });
    
    const container = document.getElementById('student-info-section');
    if (container) {
      container.innerHTML = `<p class="error-text">학생 정보를 불러오는 중 오류가 발생했습니다.<br>${error.message || '알 수 없는 오류'}<br>에러 코드: ${error.code || 'N/A'}</p>`;
    }
    
    const notesContainer = document.getElementById('student-notes-section');
    if (notesContainer) {
      notesContainer.innerHTML = `<p class="error-text">일기 목록을 불러오는 중 오류가 발생했습니다.<br>${error.message || '알 수 없는 오류'}</p>`;
    }
  }
}

// 테스트 모드 데이터 확인
function isTestModeData(note) {
  if (!note.userId) return false;
  return adminUids.includes(note.userId);
}

// 학생 정보 표시
function displayStudentInfo(userInfo, notes) {
  const container = document.getElementById('student-info-section');
  if (!container) return;
  
  if (!userInfo) {
    container.innerHTML = '<p class="error-text">학생 정보를 찾을 수 없습니다.</p>';
    return;
  }
  
  const studentName = userInfo.name || '이름 없음';
  const studentId = userInfo.studentId || '없음';
  const grade = userInfo.grade || '';
  const classNum = userInfo.classNum || '';
  const number = userInfo.number || '';
  const pieTokens = userInfo.pieTokens || 0;
  const notesCount = notes.length;
  
  let className = '반 정보 없음';
  if (grade && classNum) {
    className = `${grade}학년 ${classNum}반`;
  }
  
  // 제목 업데이트
  const titleElement = document.getElementById('student-detail-title');
  if (titleElement) {
    titleElement.textContent = `${studentName} 학생의 일기`;
  }
  
  container.innerHTML = `
    <div class="student-detail-info-card">
      <div class="student-detail-header">
        <h2>${studentName}</h2>
        <span class="student-detail-class">${className} ${number}번</span>
      </div>
      <div class="student-detail-info">
        <div class="info-item">
          <span class="info-label">학번:</span>
          <span class="info-value">${studentId}</span>
        </div>
        <div class="info-item">
          <span class="info-label">작성한 일기:</span>
          <span class="info-value">${notesCount}개</span>
        </div>
        <div class="info-item">
          <span class="info-label">🥧 파이 토큰:</span>
          <span class="info-value pie-tokens-value">${pieTokens}개</span>
        </div>
      </div>
    </div>
  `;
}

// 학생 일기 목록 표시
function displayStudentNotes(notes) {
  const container = document.getElementById('student-notes-section');
  if (!container) return;
  
  if (notes.length === 0) {
    container.innerHTML = '<p class="empty-text">작성한 일기가 없습니다.</p>';
    return;
  }
  
  let html = '<div class="student-notes-list">';
  html += '<h3>작성한 일기 목록</h3>';
  html += '<div class="student-notes-grid">';
  
  notes.forEach(({ id, data: note }) => {
    const date = note.activityDate || '';
    const time = note.activityTime || '';
    const emotion = note.emotion || '😊';
    const hasFeedback = note.feedback && note.feedback.trim().length > 0;
    const diaryPreview = note.diaryContent 
      ? note.diaryContent.substring(0, 100) + (note.diaryContent.length > 100 ? '...' : '')
      : '일기 내용 없음';
    
    html += `
      <div class="student-note-card" onclick="openFeedbackWindow('${id}')">
        <div class="student-note-header">
          <span class="student-note-emotion">${emotion}</span>
          <div class="student-note-info">
            <span class="student-note-date">${date} ${time}</span>
            ${hasFeedback ? '<span class="feedback-badge">💬 피드백 있음</span>' : ''}
          </div>
        </div>
        <div class="student-note-preview">
          <p>${diaryPreview}</p>
        </div>
      </div>
    `;
  });
  
  html += '</div></div>';
  container.innerHTML = html;
}

// 피드백 창 열기 (모달로 표시)
window.openFeedbackWindow = function(noteId) {
  if (!window.studentNotesData) {
    console.error('studentNotesData가 초기화되지 않았습니다.');
    alert('데이터를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
    return;
  }
  
  const noteData = window.studentNotesData.find(item => item.id === noteId);
  if (!noteData) {
    alert('노트를 찾을 수 없습니다.');
    return;
  }
  
  const note = noteData.data || noteData;
  const userInfo = note.userInfo || {};
  
  // 학생 정보 추출
  const className = userInfo.classNum ? `${userInfo.grade}학년 ${userInfo.classNum}반` : '반 정보 없음';
  const studentNumber = userInfo.number || '번호 없음';
  const studentName = note.userName || userInfo.name || '이름 없음';
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
    const escapeHandler = (e) => {
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

// 피드백 추천받기
window.suggestFeedback = async function(noteId) {
  const noteData = window.studentNotesData.find(item => item.id === noteId);
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
- 이모티콘을 적절히 사용해서 따뜻함을 전달해

피드백을 작성해줘:`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
    const noteData = window.studentNotesData.find(item => item.id === noteId);
    if (!noteData) {
      alert('노트를 찾을 수 없습니다.');
      return;
    }
    
    const note = noteData.data || noteData;
    const noteUserId = note.userId;
    
    if (!noteUserId) {
      alert('사용자 ID를 찾을 수 없습니다.');
      return;
    }
    
    // 피드백 저장
    const noteRef = doc(db, 'studentNotes', noteId);
    const updateData = {
      feedback: feedback,
      feedbackDate: new Date().toISOString()
    };
    
    // 파이 토큰 지급 (아직 받지 않은 경우에만)
    if (!note.receivedPieToken) {
      updateData.receivedPieToken = true;
      
      // 사용자의 파이 토큰 증가
      const userRef = doc(db, 'users', noteUserId);
      await updateDoc(userRef, {
        pieTokens: increment(1)
      });
    }
    
    await updateDoc(noteRef, updateData);
    
    // 전역 데이터 업데이트
    note.feedback = feedback;
    note.receivedPieToken = updateData.receivedPieToken || note.receivedPieToken;
    
    alert('돌려주기가 저장되었습니다.' + (updateData.receivedPieToken ? ' 파이 토큰 1개가 지급되었습니다.' : ''));
    
    // 모달 닫기
    closeFeedbackWindow();
    
    // 일기 목록 새로고침
    await loadStudentDetail(userId);
    
  } catch (error) {
    console.error('돌려주기 저장 실패:', error);
    alert('돌려주기 저장 중 오류가 발생했습니다.');
  }
};

