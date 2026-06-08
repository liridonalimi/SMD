namespace SMD.API.Contracts.WarehouseTasks;

public class WarehouseTaskDailyReportDto
{
    public DateTime Date { get; set; }
    public int OpenedToday { get; set; }
    public int AssignedToday { get; set; }
    public int InProgressToday { get; set; }
    public int CompletedToday { get; set; }
    public int ProblemToday { get; set; }
    public List<WarehouseTaskWorkerDailyReportDto> Workers { get; set; } = [];
}

public class WarehouseTaskWorkerDailyReportDto
{
    public Guid? UserId { get; set; }
    public string WorkerName { get; set; } = "";
    public int Completed { get; set; }
    public int InProgress { get; set; }
    public int Problems { get; set; }
}
