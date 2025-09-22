import dayjs from "dayjs";

function removeKey(obj, key) {
  if (obj && obj[key] !== undefined) {
    delete obj[key];
  }
}

function convertToLocalTimezone(date) {
  if (!date) return null;
  // Change 'Asia/Kolkata' to your desired timezone if needed
  return dayjs(date).tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
}

export { removeKey, convertToLocalTimezone };
