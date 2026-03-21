const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const normalizePath = (path: string) => path.startsWith('/') ? path : `/${path}`;

const currentHostname =
  typeof window !== 'undefined' ? window.location.hostname : 'localhost';

const currentProtocol =
  typeof window !== 'undefined' ? window.location.protocol : 'http:';

const serverPort = import.meta.env.VITE_SERVER_PORT || '3007';
const serverProtocol =
  import.meta.env.VITE_SERVER_PROTOCOL || (currentProtocol === 'https:' ? 'https:' : 'http:');

const envServerOrigin = import.meta.env.VITE_SERVER_ORIGIN?.trim();

export const SERVER_ORIGIN = envServerOrigin
  ? trimTrailingSlash(envServerOrigin)
  : `${serverProtocol}//${currentHostname}:${serverPort}`;

export const API_BASE_URL = SERVER_ORIGIN;

export const SOCKET_URL = SERVER_ORIGIN;

export const buildServerUrl = (path: string) => {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${SERVER_ORIGIN}${normalizePath(path)}`;
};
