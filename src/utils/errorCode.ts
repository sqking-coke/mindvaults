/**
 * 错误码 → 中文提示映射。
 * 对齐后端 app/core/exceptions.py 错误码规范。
 */
export const ERROR_MESSAGES: Record<number, string> = {
  1001: "请检查输入内容",
  1002: "请检查填写内容",
  1003: "API Key 无效或缺失，请检查配置",
  2001: "该文档已被删除或不存在",
  2002: "仅支持 PDF、Word、Markdown 和 TXT 格式",
  2003: "文件大小超过限制，请压缩后重试",
  2004: "操作失败，请刷新后重试",
  3001: "该对话已被删除",
  4001: "知识库中暂无相关内容，请上传文档后再试",
  4004: "切片数据不存在",
  5001: "AI 服务暂时不可用，请稍后重试",
  5002: "向量服务未就绪，请检查模型配置",
  5003: "请先配置大模型 API Key",
  6001: "该知识库已被删除",
  7001: "数据源连接失败，请检查配置",
  8001: "系统繁忙，请稍后重试",
  8002: "缓存服务异常（不影响核心功能）",
  9001: "系统异常，请联系管理员",
};

export function getErrorMessage(code: number, fallback?: string): string {
  return ERROR_MESSAGES[code] || fallback || `未知错误 (${code})`;
}
