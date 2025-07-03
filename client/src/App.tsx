import './App.css'
import { RouterProvider } from 'react-router-dom';
import router from './router';
function App() {
    return (
        <RouterProvider router={router}/> //React Router v6 的根组件
    )
}

export default App
