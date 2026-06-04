// localStorageからデータを取得
let tasks = [];
if (localStorage.getItem("notion_tasks")) {
    const json = localStorage.getItem("notion_tasks");
    tasks = JSON.parse(json);
}

// 画面読み込み時に一覧を表示
renderTasks();

// ==========================================
// ドロップダウンの文字を賢く切り替える魔法
// ==========================================
$("#task_importance option").each(function () {
    $(this).attr("data-fulltext", $(this).text());
});

$("#task_importance").on("mousedown focus", function () {
    $(this).css("color", "var(--text-main)"); // 開いた時は文字色を濃くする
    $(this).find("option").each(function () {
        const fullText = $(this).attr("data-fulltext");
        if (fullText) $(this).text(fullText);
    });
});

$("#task_importance").on("change blur", function () {
    const $selected = $(this).find("option:selected");
    const fullText = $selected.attr("data-fulltext");
    
    if (fullText && $selected.val() !== "") {
        let shortText = fullText;
        if (fullText.includes("（")) {
            shortText = fullText.split("（")[0].trim();
        } else if (fullText.includes("(")) {
            shortText = fullText.split("(")[0].trim();
        }
        $selected.text(shortText);
        $(this).css("color", "var(--text-main)"); // 選択後は文字色を濃くする
    } else {
        $(this).css("color", "var(--text-placeholder)"); // 未選択時は薄くする
    }
});
$("#task_importance").trigger("blur");


// ==========================================
// タスクの保存処理
// ==========================================
$("#save_btn").on("click", function () {
    const title = $("#task_title").val().trim();
    const importanceVal = $("#task_importance").val();
    const dueDate = $("#task_duedate").val(); // 空なら「未定」になる

    // タスク名が空の場合は「無題」にする
    const finalTitle = title === "" ? "無題" : title;

    if (!importanceVal) {
        alert("重要度を選択してください");
        return;
    }

    const importance = Number(importanceVal);
    const urgency = calculateUrgency(dueDate);
    const score = importance * urgency;

    const newTask = {
        id: Date.now(),
        title: finalTitle,
        importance: importance,
        dueDate: dueDate, // 空文字の可能性あり
        urgency: urgency,
        score: score,
        isCompleted: false,
        completedDate: null // 完了日を記録する用
    };

    tasks.push(newTask);
    saveToLocalStorage();
    renderTasks();

    // 入力欄のリセット
    $("#task_title").val("");
    $("#task_importance").val("").trigger("blur");
    $("#task_duedate").val("").type = 'text';
    $("#task_duedate").addClass('placeholder-color').attr('type', 'text');
});


// ==========================================
// チェックボックス（完了）の切り替え処理
// ==========================================
$("#task_list").on("change", ".task-checkbox", function () {
    const taskId = Number($(this).data("id"));
    const isChecked = $(this).prop("checked");

    for (let i = 0; i < tasks.length; i++) {
        if (tasks[i].id === taskId) {
            tasks[i].isCompleted = isChecked;
            if (isChecked) {
                // 当日の日付を YYYY-MM-DD 形式で記録
                const today = new Date();
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                tasks[i].completedDate = `${yyyy}-${mm}-${dd}`;
            } else {
                tasks[i].completedDate = null;
            }
            break;
        }
    }

    saveToLocalStorage();
    renderTasks();
});


// ==========================================
// ★ダブルクリックでの削除処理（確認アラート付き）
// ==========================================
$("#task_list").on("dblclick", ".task-item", function (e) {
    // チェックボックスをクリックした時は削除が動かないようにガード
    if ($(e.target).hasClass('task-checkbox')) return;

    const taskId = Number($(this).find(".task-checkbox").data("id"));
    const task = tasks.find(t => t.id === taskId);

    if (confirm(`「${task.title}」を本当に削除しますか？`)) {
        tasks = tasks.filter(t => t.id !== taskId);
        saveToLocalStorage();
        renderTasks();
    }
});


// ==========================================
// 各種ロジック関数
// ==========================================

// 緊急度の計算関数
function calculateUrgency(dueDateStr) {
    if (!dueDateStr) return 1; // 期日未定は緊急度1

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const due = new Date(dueDateStr);
    due.setHours(0, 0, 0, 0);

    const diffTime = due - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 5;  // 今日または期限切れ
    if (diffDays <= 3) return 4;  // 1〜3日
    if (diffDays <= 7) return 3;  // 4〜7日
    if (diffDays <= 30) return 2; // 8〜30日
    return 1;                     // 31日以上
}

// localStorage保存
function saveToLocalStorage() {
    localStorage.setItem("notion_tasks", JSON.stringify(tasks));
}

// ★画面描画と高度な並び替え（ソート）関数
function renderTasks() {
    // 特殊な並び替えルール
    tasks.sort(function(a, b) {
        // 1. 完了状態が異なる場合、未完了(false)を上に、完了(true)を下に配置
        if (a.isCompleted !== b.isCompleted) {
            return a.isCompleted ? 1 : -1;
        }
        
        // 2. 両方とも「未完了」なら、スコアが高い順（降順）
        if (!a.isCompleted) {
            return b.score - a.score;
        }
        
        // 3. 両方とも「完了」なら、完了した日が遅い順（＝直近に完了したものが上：降順）
        // 文字列としての比較（"2026-06-05" vs "2026-06-04"）で並び替えます
        if (a.completedDate < b.completedDate) return 1;
        if (a.completedDate > b.completedDate) return -1;
        return 0;
    });

    $("#task_list").empty();
    const todayStr = new Date().toISOString().split('T')[0];

    let htmlViews = [];
    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        
        let colorClass = "";
        // 完了していないタスクのみ期限の色分けを行う
        if (!task.isCompleted && task.dueDate) {
            const today = new Date();
            today.setHours(0,0,0,0);
            const due = new Date(task.dueDate);
            due.setHours(0,0,0,0);
            const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));

            if (diffDays < 0) {
                colorClass = "danger"; // 今日を過ぎたタスク（赤）
            } else if (diffDays <= 7) {
                colorClass = "warning"; // 今日から7日以内のタスク（黄）
            }
        }

        const completedClass = task.isCompleted ? "completed" : "";
        const checkedAttr = task.isCompleted ? "checked" : "";
        const dateText = task.dueDate ? `期日: ${task.dueDate}` : "期日: 未定";
        
        // 完了している場合は完了日バッジを表示
        const completedBadge = task.isCompleted ? `<span class="completed-date">完了日: ${task.completedDate}</span>` : "";

        const html = `
            <li class="task-item ${completedClass} ${colorClass}">
                <input type="checkbox" class="task-checkbox" data-id="${task.id}" ${checkedAttr}>
                <div class="task-content">
                    <span class="task-title">${task.title}</span>
                    <div class="task-meta">
                        <span>重要度: ${task.importance}</span>
                        <span>緊急度: ${task.urgency}</span>
                        <span>${dateText}</span>
                        ${completedBadge}
                    </div>
                </div>
                <div class="task-score">${task.score}pt</div>
            </li>
        `;
        htmlViews.push(html);
    }

    $("#task_list").html(htmlViews.join(""));
}