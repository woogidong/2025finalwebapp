// Firebase 설정 - 환경변수에서 불러오기
const getEnvVar = (key) => {
  const value = import.meta.env[key];
  // 디버깅: 개발 환경에서만 로그 출력
  if (import.meta.env.DEV) {
    console.log(`환경변수 ${key}:`, value ? '설정됨' : '없음');
  }
  if (!value || value === 'undefined' || value.includes('your_')) {
    return null;
  }
  return value;
};

const requiredEnvVars = {
  apiKey: getEnvVar('VITE_FIREBASE_API_KEY'),
  authDomain: getEnvVar('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: getEnvVar('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: getEnvVar('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnvVar('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnvVar('VITE_FIREBASE_APP_ID')
};

// 환경변수 검증
const missingVars = Object.entries(requiredEnvVars)
  .filter(([key, value]) => !value)
  .map(([key]) => key);

if (missingVars.length > 0) {
  console.error('❌ Firebase 환경변수가 설정되지 않았습니다:', missingVars);
  console.error('❌ .env 파일에 Firebase 설정값을 입력해주세요.');
  console.error('❌ 현재 로드된 환경변수:', {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY ? '설정됨' : '없음',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ? '설정됨' : '없음',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ? '설정됨' : '없음',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ? '설정됨' : '없음',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ? '설정됨' : '없음',
    appId: import.meta.env.VITE_FIREBASE_APP_ID ? '설정됨' : '없음'
  });
}

// Firebase 설정 객체 생성 (값이 없어도 객체는 생성)
export const firebaseConfig = {
  apiKey: requiredEnvVars.apiKey || '',
  authDomain: requiredEnvVars.authDomain || '',
  projectId: requiredEnvVars.projectId || '',
  storageBucket: requiredEnvVars.storageBucket || '',
  messagingSenderId: requiredEnvVars.messagingSenderId || '',
  appId: requiredEnvVars.appId || ''
};

// 설정이 완전한지 확인하는 함수
export const isFirebaseConfigValid = () => {
  return Object.values(requiredEnvVars).every(value => value !== null);
};

// 교사 이메일 리스트 (나중에 설정할 예정)
// Firebase Firestore에서 관리하거나 여기에 추가할 수 있습니다
export const teacherEmails = [
  // 예시: "teacher@example.com"
  // 실제 교사 이메일을 여기에 추가하세요
];

// 관리자 UID 리스트 (환경변수에서 불러오기)
const getAdminUids = () => {
  const adminUidsEnv = getEnvVar('VITE_ADMIN_UIDS');
  if (!adminUidsEnv) {
    return [];
  }
  // 쉼표로 구분된 UID 리스트를 배열로 변환
  return adminUidsEnv.split(',').map(uid => uid.trim()).filter(uid => uid.length > 0);
};

export const adminUids = getAdminUids();

