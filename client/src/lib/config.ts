export const config = {
  pocketbase: {
    url: import.meta.env.VITE_PB_URL || 'http://localhost:8090',
  },
  api: {
    url: import.meta.env.VITE_SERVER_URL || 'http://localhost:3000/api',
  },
};
