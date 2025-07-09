import settingStyle from './index.module.scss';
import { Image as AntdImage } from "antd";
import { useSelector } from 'react-redux';
import { useState, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { uploadImg } from './api';
import { updateProfile } from '@/store/userStore';
import CropperModal from '@/globalComponents/cropper'; 

function SettingView() {
    const [loading, setLoading] = useState(false);
    const dispatch = useDispatch();
    const inputRef = useRef<HTMLInputElement>(null);
    const [cropModalOpen, setCropModalOpen] = useState(false);
    const [rawImage, setRawImage] = useState<string>('');
    // 上传头像
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                setRawImage(ev.target?.result as string);
                setCropModalOpen(true);
            };
            reader.readAsDataURL(file);
        }
    };

    // 裁剪完成后上传
    const handleCropOk = (croppedBlob: Blob) => {
        // 用formData 上传文件
        // 自动生成 multipart/form-data 的请求体，适合上传文件和表单混合数据。
        // 后端用 multer 这样的中间件来解析 multipart/form-data
        //multer 自动把文件存到服务器的某个目录（如 uploads/）
        //数据库只存文件的相对路径或 URL
        // FormData 不能用普通的 console.log 查看内容，要用 formData.entries() 或 formData.get() 来查看
        // console.log(formData.get('file'));
        const formData = new FormData();
        formData.append('file', croppedBlob, 'avatar.jpg');
        setLoading(true);
        uploadImg(formData).then(res => {
            dispatch(updateProfile({ avatar: res.data.url }));
            setLoading(false);
        }).catch(err => {
            setLoading(false);
            console.log(err);
        });
        setCropModalOpen(false);
    };
    // 点击上传按钮
    const handleClickUpload = () => {
        inputRef.current?.click();
    }
    // 用户信息
    const user = useSelector((state: any) => state.user);

    return (
        <div className={settingStyle.setting_view_mask}>
        <div className={settingStyle.setting_view}>
            <div className={settingStyle.setting_view_title}>
                <h1>设置</h1>
            </div>

            <div className={settingStyle.setting_view_body}>
                {/* 左侧 */}
                <div className={settingStyle.setting_view_left}>
                    <AntdImage width={130} src={user.avatar ? `http://localhost:3007${user.avatar}` : 'src/assets/images/defaultAvatar.jpg'}  />
                    {/* 事件处理函数（如 onChange、onClick 等）默认传入事件对象（event） */}
                    <input ref={inputRef} type="file" style={{display: 'none'}} accept="image/png, image/jpeg" onChange={handleChange} /> 
                    
                    <button className={settingStyle.setting_view_upload_button} type="button" onClick={handleClickUpload}>
                        {loading ? "加载中..." : "更换头像"}
                    </button>
                    <CropperModal
                        open={cropModalOpen}
                        image={rawImage}
                        onCancel={() => setCropModalOpen(false)}
                        onOk={handleCropOk}
                    />
                </div>
                {/* 右侧 */}
                <div className={settingStyle.setting_view_right}>
                    
                </div>
            </div>
        </div>
        </div>
    )
}
export default SettingView;