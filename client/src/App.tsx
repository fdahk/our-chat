import './App.css'
import { RouterProvider } from 'react-router-dom';
import { Provider } from 'react-redux';
import { rootStore, rootPersistor } from './store/rootStore';
import { PersistGate } from 'redux-persist/integration/react';
import router from './router';
import GlobalMessageListener from './globalComponents/globalMessageListener';
import ThemeProvider from './style/antD'; // antD全局主题配置
function App() {
    return (
        <Provider store={rootStore}> {/* 提供context，所有组件可通过useSelector、useDispatch等hook获取store中的状态和dispatch */}
            <PersistGate loading={null} persistor={rootPersistor}> {/* 提供persistGate，用于在页面刷新时恢复store中的状态，loading为加载时显示的组件 */}
                <ThemeProvider>
                    {/* 应用组件 */}
                    <GlobalMessageListener /> {/* 全局监听消息 */}
                    <RouterProvider router={router}/> {/* 路由 */}
                </ThemeProvider>
            </PersistGate>
        </Provider>
    )
}

export default App
