import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { type RootState } from '../store/user';
import SocketService from './socket';
import { addGlobalMessage } from '../store/chat';

export default function GlobalSocketListener() {
  const userId = useSelector((state: RootState) => state.user.id);
  const dispatch = useDispatch();

  useEffect(() => {
    if (!userId) return;
    const socket = SocketService.getInstance();
    socket.connect();

    socket.on('receiveMessage', (msg: any) => {
      dispatch(addGlobalMessage(msg));
    });

    return () => {
      socket.off('receiveMessage');
    };
  }, [userId, dispatch]);

  return null;
}
