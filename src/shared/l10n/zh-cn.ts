const zhCN: Record<string, string> = {
  "Failed to load: ${reason}": "加载失败：${reason}",
  "Failed to load: ${reason}. Cleanup also failed: ${cleanup}":
    "加载失败：${reason}。清理时也出错：${cleanup}",
  "Failed to unload: ${reason}": "卸载失败：${reason}",
  "Task tag name": "任务标签名",
  "The Orca tag that marks a block as a task. Leave empty to use the default name.":
    "用来把块标记为任务的 Orca 标签。留空时使用默认名称。",
  'Could not set up the task tag "${name}": ${reason}':
    "无法设置任务标签“${name}”：${reason}",
  'A tag named "${name}" already exists and its properties ${properties} have a different type than the plugin needs. Task features are paused. Choose another task tag name in the plugin settings.':
    "已经有一个名为“${name}”的标签，它的属性 ${properties} 与插件需要的类型不同。任务功能已暂停，请在插件设置中换一个任务标签名。",
  'The properties ${properties} of the task tag "${name}" were changed to a different type. The plugin reads them as empty and will not write them until their type is changed back.':
    "任务标签“${name}”的属性 ${properties} 被改成了其他类型。在类型改回之前，插件把它们读作空值，也不会写入它们。",
  "Read current block as task (debug)": "读取当前块为任务（调试）",
  "Query inbox tasks (debug)": "查询收集箱中的任务（调试）",
};

export default zhCN;
