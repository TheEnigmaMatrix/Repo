const SCHEDULE_URL =
"https://oaearcywpoqusbqmeagw.supabase.co/storage/v1/object/public/bus-schedule%20bucket/schedule.png";

function loadSchedule() {
    const container = document.getElementById("busScheduleList");

    if (!container) {
        console.error("busScheduleList not found");
        return;
    }

    container.innerHTML = `<div class="no-schedule">Loading latest bus schedule...</div>`;

    const img = new Image();
    img.src = SCHEDULE_URL + "?v=" + Date.now();

    img.onload = () => {
        container.innerHTML = `
            <div class="schedule-image-card">
                <img src="${img.src}" alt="Bus Schedule">
            </div>
        `;
    };

    img.onerror = () => {
        container.innerHTML = `
            <div class="no-schedule">Bus schedule not uploaded yet</div>
        `;
    };
}

document.addEventListener("DOMContentLoaded", loadSchedule);