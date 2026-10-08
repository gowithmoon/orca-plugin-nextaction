const zhCN: Record<string, string> = {
  "Failed to load: ${reason}": "加载失败：${reason}",
  "Failed to load: ${reason}. Cleanup also failed: ${cleanup}":
    "加载失败：${reason}。清理时也出错：${cleanup}",
  "Failed to unload: ${reason}": "卸载失败：${reason}",
  "Task tag name": "任务标签名",
  "The Orca tag that marks a block as a task. Changing it renames the tag; existing tasks keep it.":
    "用来把块标记为任务的 Orca 标签。修改后会重命名这个标签，已有任务不受影响。",
  "Day boundary": "日界线",
  "A day starts at this time. Usually set in the early morning.":
    "一天从这个时刻开始，一般设在凌晨。",
  'The task tag name cannot be empty. It was set back to "${name}".':
    "任务标签名不能为空，已改回“${name}”。",
  '"${requested}" is already used by another page or block, so the task tag was not renamed. The name was set back to "${name}".':
    "“${requested}”已被其他页面或块使用，任务标签没有改名，名称已改回“${name}”。",
  'Could not rename the task tag "${name}": ${reason}':
    "无法重命名任务标签“${name}”：${reason}",
  'Could not set up the task tag "${name}": ${reason}':
    "无法设置任务标签“${name}”：${reason}",
  'A tag named "${name}" already exists and its properties ${properties} have a different type than the plugin needs. Task features are paused. Choose another task tag name in the plugin settings.':
    "已经有一个名为“${name}”的标签，它的属性 ${properties} 与插件需要的类型不同。任务功能已暂停，请在插件设置中换一个任务标签名。",
  'The properties ${properties} of the task tag "${name}" were changed to a different type. The plugin reads them as empty and will not write them until their type is changed back.':
    "任务标签“${name}”的属性 ${properties} 被改成了其他类型。在类型改回之前，插件把它们读作空值，也不会写入它们。",
  "Read current block as task (debug)": "读取当前块为任务（调试）",
  "Set importance 6 and due tomorrow (debug)":
    "把重要性设为 6、截止日期设为明天（调试）",
  "Read and write a test plugin block property (debug)":
    "读写测试用的插件块属性（调试）",
  "Query inbox tasks (debug)": "查询收集箱中的任务（调试）",
  "Print the current logical day (debug)": "打印当前逻辑日（调试）",
  "Convert to task": "转为任务",
  "This block is already a task.": "这个块已经是任务。",
  "The task tag itself cannot be converted to a task.":
    "任务标签自身不能转为任务。",
  "This block cannot be converted to a task: journal blocks, and blocks with neither a parent nor an alias, cannot be tasks.":
    "这个块不能转为任务：日记块，以及既没有父块也没有别名的块，都不能是任务。",
  "Put the cursor in a block to convert it to a task.":
    "请把光标放在要转为任务的块中。",
  "Task features are paused, so the block was not converted. See the plugin's earlier notice or its task tag setting.":
    "任务功能已暂停，块没有转为任务。请查看插件之前的通知或任务标签设置。",
  "Could not convert to a task: ${reason}": "无法转为任务：${reason}",
  Inbox: "收集箱",
  Todo: "待开始",
  Doing: "进行中",
  Waiting: "等待中",
  Someday: "将来/也许",
  Done: "已完成",
  "Drop task": "放弃",
  "Task dropped": "已放弃",
  "Could not drop the task: ${reason}": "无法放弃任务：${reason}",
  "Could not change the status: ${reason}": "无法修改状态：${reason}",
  "Could not open the task menu: ${reason}": "无法打开任务操作菜单：${reason}",
  "Task features are paused. See the plugin's earlier notice or its task tag setting.":
    "任务功能已暂停。请查看插件之前的通知或任务标签设置。",
};

export default zhCN;
