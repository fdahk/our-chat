import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface Message {
  convId: string;
  from: string | number;
  content: string;
  time: string;
  // 其他字段
}

interface ChatState {
  globalMessages: Message[];
}

const initialState: ChatState = {
  globalMessages: [],
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    addGlobalMessage(state, action: PayloadAction<Message>) {
      state.globalMessages.push(action.payload);
    },
    // 其他 reducer...
  },
});

export const { addGlobalMessage } = chatSlice.actions;
export default chatSlice.reducer;
