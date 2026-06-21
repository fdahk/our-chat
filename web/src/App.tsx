import './App.css'
import { RouterProvider } from 'react-router-dom';
import { Provider } from 'react-redux';
import { rootStore, rootPersistor } from './store/rootStore';
import { PersistGate } from 'redux-persist/integration/react';
import router from './router';
import ThemeProvider from './style/antD'; // antD全局主题配置 + locale 跟随 i18n
import { ToastProvider } from '@/globalComponents/toast';
function App() {
    return (
        <Provider store={rootStore}> {/* 提供context，所有组件可通过useSelector、useDispatch等hook获取store中的状态和dispatch */}
            <PersistGate loading={null} persistor={rootPersistor}> {/* 提供persistGate，用于在页面刷新时恢复store中的状态，loading为加载时显示的组件 */}
                <ThemeProvider>
                    <ToastProvider>
                        <RouterProvider router={router}/>
                    </ToastProvider>
                </ThemeProvider>
            </PersistGate>
        </Provider>
    )
}

export default App
