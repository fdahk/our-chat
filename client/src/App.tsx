import './App.css'
import { RouterProvider } from 'react-router-dom';
import { Provider } from 'react-redux';
import router from './router';
import store from './store/user';
import { ConfigProvider } from 'antd';

function App() {
    return (
        <Provider store={store}>
            <ConfigProvider
                theme={{
                    token: {
                        colorPrimary: '#07c160', //UI组件主题色
                    },
                }}
            >
                <RouterProvider router={router}/> 
            </ConfigProvider>
        </Provider>
    )
}

export default App
