import './App.css'
import { RouterProvider } from 'react-router-dom';
import { Provider } from 'react-redux';
import store, { persistor } from './store/user';
import { ConfigProvider } from 'antd';
import { PersistGate } from 'redux-persist/integration/react';
import router from './router';
import GlobalSocketListener from './utils/globalSocketListener';

function App() {
    return (
        <Provider store={store}>
            <PersistGate loading={null} persistor={persistor}>
                <ConfigProvider
                    theme={{
                        token: {
                            colorPrimary: '#07c160', //UI组件主题色
                        },
                    }}
                >
                    <GlobalSocketListener /> {/* 全局监听socket消息 */}
                    <RouterProvider router={router}/> {/* 路由 */}
                </ConfigProvider>
            </PersistGate>
        </Provider>
    )
}

export default App
