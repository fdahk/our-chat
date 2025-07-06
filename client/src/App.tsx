import './App.css'
import { RouterProvider } from 'react-router-dom';
import { Provider } from 'react-redux';
import { rootStore, rootPersistor } from './store/rootStore';
import { ConfigProvider } from 'antd';
import { PersistGate } from 'redux-persist/integration/react';
import router from './router';
import GlobalSocketListener from './utils/globalSocketListener';

function App() {
    return (
        <Provider store={rootStore}> {/* 提供context，所有组件可通过useSelector、useDispatch等hook获取store中的状态和dispatch */}
            <PersistGate loading={null} persistor={rootPersistor}> {/* 提供persistGate，用于在页面刷新时恢复store中的状态，loading为加载时显示的组件 */}
                <ConfigProvider
                    theme={{
                        token: {
                            colorPrimary: '#07c160', //UI组件主题色
                        },
                    }}
                >
                    {/* 应用级组件 */}
                    <GlobalSocketListener /> {/* 全局监听socket消息 */}
                    <RouterProvider router={router}/> {/* 路由 */}
                </ConfigProvider>
            </PersistGate>
        </Provider>
    )
}

export default App
