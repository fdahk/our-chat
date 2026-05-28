import { post } from "@/utils/http"; 

export const uploadImg = (formData: FormData) => {
    return post<{ url: string }>('user/uploads/uploadImg', formData);
}