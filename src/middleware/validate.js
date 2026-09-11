/** zod schema से req.body जाँचें और साफ़ किया हुआ data वापस body में रखें */
export const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) return next(result.error);
  req.body = result.data;
  next();
};
