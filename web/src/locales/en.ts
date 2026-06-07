// English translations. Schema must mirror zh.ts (enforced by `LocaleSchema` type).

import type { LocaleSchema } from './zh';

const en: LocaleSchema = {
  common: {
    confirm: 'Confirm',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    search: 'Search',
    loading: 'Loading…',
    submit: 'Submit',
    submitting: 'Working…',
    retry: 'Retry',
    close: 'Close',
    yes: 'Yes',
    no: 'No',
    back: 'Back',
    next: 'Next',
    invalid: 'Please check your inputs',
    networkError: 'Network error, please retry',
  },

  http: {
    requestConfigError: 'Request config error',
    unauthorized: 'Unauthorized, please sign in again',
    badRequest: 'Bad request',
    forbidden: 'Forbidden',
    notFound: 'Resource not found',
    conflict: 'Data conflict',
    unprocessable: 'Validation failed',
    serverError: 'Server error',
    requestFailed: 'Request failed ({{status}})',
    timeout: 'Request timed out, please retry',
    networkError: 'Network error, please check your connection',
  },

  auth: {
    brand: 'OUR · CHAT',
    eyebrow: 'Looking for new-grad roles',
    intro: 'hello~',
    scrollHint: 'Scroll',

    sections: {
      about: 'About',
      experience: 'Experience',
      skills: 'Stack',
      contact: 'Contact',
    },

    nav: {
      home: 'Home',
      works: 'Works',
    },

    works: {
      title: 'Works',
      subtitle: 'Four projects I shipped end-to-end. Each card is the specific problem I picked, and what I decided.',
      more: 'More on GitHub @fdahk',
    },

    cells: {
      identity: 'Identity',
      track: 'Track',
      award: 'Award',
      online: 'Online',
      targetingRoles: 'Targeting 2026 front-end / full-stack roles',
      nationalLevel: 'National level',
      githubJuejin: 'GitHub · Juejin',
      email: 'Email',
      phone: 'Phone',
      juejin: 'Juejin',
    },

    login: {
      title: 'Sign in',
      sub: 'Welcome back. Pick up where you left.',
      submit: 'Sign in',
      submitting: 'Signing in…',
      ok: 'Welcome back',
      fail: 'Sign in failed, please retry',
      switchToSignup: 'No account? Create one',
    },

    signup: {
      title: 'Create account',
      sub: 'Create an account. Come back anytime.',
      submit: 'Create account',
      submitting: 'Creating…',
      ok: 'Account created, redirecting to sign in',
      fail: 'Sign up failed, please check the form',
      switchToLogin: 'Already have one? Sign in',
    },

    fields: {
      username: 'Username',
      email: 'Email',
      nickname: 'Nickname (optional)',
      password: 'Password',
      confirmPassword: 'Confirm password',
      remember: 'Remember me',
      forgot: 'Forgot',
      agreement: 'I have read and agree to the Terms & Privacy Policy',
    },

    validate: {
      usernameRequired: 'Username required',
      usernameMin: 'At least 3 characters',
      usernameRule: 'Only letters / digits / underscore / CJK allowed',
      usernameTaken: 'Username already taken',
      emailRequired: 'Email required',
      emailRule: 'Invalid email format',
      emailTaken: 'Email already registered',
      passwordRequired: 'Password required',
      passwordRule: 'Must contain a-z, A-Z, 0-9; min length 6',
      confirmRequired: 'Confirm password required',
      confirmMismatch: 'Passwords do not match',
      agreementRequired: 'Please accept the terms',
    },

    footer: {
      copy: '© 2026 Tu Jiang',
    },
  },

  chat: {
    placeholder: 'Type a message',
    send: 'Send',
    download: 'Download',
    sentFile: 'sent a file',
    noConversation: 'Pick a conversation to start',
    searchPlaceholder: 'Search',
    iconLabels: {
      emoji: 'Emoji',
      file: 'File',
      screenshot: 'Screenshot',
      record: 'History',
      voice: 'Voice call',
      video: 'Video call',
    },
    errors: {
      noActiveConversation: 'No conversation selected',
      noFriendInfo: 'Cannot load contact info',
      uploadFailed: 'Upload failed',
    },
  },

  directory: {
    addSearchPlaceholder: 'WeChat ID / phone',
    searchPlaceholder: 'Search',
    cancel: 'Cancel',
    notFound: 'No matching user found. Please double-check the ID.',
    searchPrefix: 'Search:',
    newFriend: 'New friend',
    region: 'China',
    title: {
      newFriendRequests: 'Friend requests',
    },
    req: {
      accept: 'Accept',
      reject: 'Reject',
      pending: 'Pending',
      accepted: 'Accepted',
      rejected: 'Rejected',
    },
    hello: 'Hi, this is',
  },

  settings: {
    title: 'Settings',
    profile: 'Profile',
    avatar: {
      uploading: 'Uploading…',
      change: 'Change avatar',
      missingUrl: 'Upload response is missing the image URL',
    },
    language: {
      title: 'Language',
      zh: '中文',
      en: 'English',
    },
  },

  layout: {
    menu: {
      setting: 'Settings',
      logout: 'Sign out',
    },
  },
};

export default en;
