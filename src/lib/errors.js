export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new ApiError(400, msg, details);
export const unauthorized = (msg = 'लॉगिन ज़रूरी है') => new ApiError(401, msg);
export const forbidden = (msg = 'यह काम आपके खाते से नहीं हो सकता') => new ApiError(403, msg);
export const notFound = (msg = 'नहीं मिला') => new ApiError(404, msg);
export const conflict = (msg) => new ApiError(409, msg);
