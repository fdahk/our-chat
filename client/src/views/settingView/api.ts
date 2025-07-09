import { post } from "@/utils/http"; 

export const uploadImg = (formData: FormData) => {
    return post('user/uploads/uploadImg', formData);
}