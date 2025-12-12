import { defineConfig } from 'vite';

export default defineConfig({
  // 기본 설정
  server: {
    port: 5173,
    open: true
  },
  // 환경변수 파일 경로
  envPrefix: 'VITE_',
  // 빌드 설정
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      input: {
        main: './index.html',
        student: './student.html',
        teacherMonitor: './teacherMonitor.html',
        studentDetail: './studentDetail.html'
      }
    }
  },
  // Public 디렉토리 설정
  publicDir: 'public'
});

