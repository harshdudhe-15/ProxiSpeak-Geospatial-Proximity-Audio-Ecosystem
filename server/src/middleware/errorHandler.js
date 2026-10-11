/**
 * Centralized Express Error Handling Middleware
 */
export function errorHandler(err, req, res, next) {
  console.error(`[API Error] ${req.method} ${req.url}:`, err.message);

  const statusCode = err.statusCode || (res.statusCode !== 200 ? res.statusCode : 500);

  res.status(statusCode).json({
    success: false,
    error: {
      message: err.message || 'Internal Server Error',
      status: statusCode,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
}
