//图片裁剪组件
// client/src/globalComponents/cropper.tsx
import React, { useState } from 'react';
import Cropper from 'react-easy-crop';
import { Modal, Slider } from 'antd';

function getCroppedImg(imageSrc: string, croppedAreaPixels: any): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.src = imageSrc;
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = croppedAreaPixels.width;
      canvas.height = croppedAreaPixels.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(
        image,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0,
        0,
        croppedAreaPixels.width,
        croppedAreaPixels.height
      );
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('裁剪失败'));
      }, 'image/jpeg');
    };
    image.onerror = reject;
  });
}

interface CropperModalProps {
  open: boolean;
  image: string;
  onCancel: () => void;
  onOk: (croppedBlob: Blob) => void;
}

const CropperModal: React.FC<CropperModalProps> = ({ open, image, onCancel, onOk }) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  const onCropComplete = (_: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const handleOk = async () => {
    if (!croppedAreaPixels) return;
    const croppedBlob = await getCroppedImg(image, croppedAreaPixels);
    onOk(croppedBlob);
  };

  return (
    <Modal open={open} onCancel={onCancel} onOk={handleOk} width={400} destroyOnClose>
      <div style={{ position: 'relative', width: '100%', height: 300, background: '#333' }}>
        <Cropper
          image={image}
          crop={crop}
          zoom={zoom}
          aspect={1}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>
      <Slider
        min={1}
        max={3}
        step={0.1}
        value={zoom}
        onChange={setZoom}
        style={{ marginTop: 16 }}
      />
    </Modal>
  );
};

export default CropperModal;