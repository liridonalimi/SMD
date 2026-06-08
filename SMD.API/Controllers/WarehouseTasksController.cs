using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using SMD.API.Contracts.WarehouseTasks;
using SMD.Domain.Entities;
using SMD.Domain.Enums;
using SMD.Infrastructure.Persistence;
using SMD.Infrastructure.Services.Audit;

namespace SMD.API.Controllers;

[Authorize]
[ApiController]
[Route("api/warehouse-tasks")]
public class WarehouseTasksController : ControllerBase
{
    private readonly SmdDbContext _db;
    private readonly AuditLogService _audit;

    public WarehouseTasksController(SmdDbContext db, AuditLogService audit)
    {
        _db = db;
        _audit = audit;
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] WarehouseTaskListQuery query)
    {
        var page = query.Page < 1 ? 1 : query.Page;
        var pageSize = query.PageSize < 1 ? 50 : Math.Min(query.PageSize, 200);

        var q = _db.WarehouseTasks
            .AsNoTracking()
            .Include(x => x.Product)
            .Include(x => x.FromBin)
            .Include(x => x.ToBin)
            .Include(x => x.AssignedToUser)
            .AsQueryable();

        if (query.Status.HasValue)
            q = q.Where(x => x.Status == query.Status.Value);
        if (query.Type.HasValue)
            q = q.Where(x => x.Type == query.Type.Value);
        if (query.AssignedToUserId.HasValue)
            q = q.Where(x => x.AssignedToUserId == query.AssignedToUserId.Value);
        if (query.ProductId.HasValue)
            q = q.Where(x => x.ProductId == query.ProductId.Value);
        if (query.NeedsHelp.HasValue)
            q = query.NeedsHelp.Value
                ? q.Where(x => x.HelpRequestedAt.HasValue && !x.HelpResolvedAt.HasValue)
                : q.Where(x => !x.HelpRequestedAt.HasValue || x.HelpResolvedAt.HasValue);

        var total = await q.CountAsync();
        var rows = await q
            .OrderByDescending(x => x.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(new
        {
            total,
            page,
            pageSize,
            data = rows.Select(ToDto).ToList()
        });
    }

    [HttpGet("metrics")]
    public async Task<IActionResult> Metrics()
    {
        var rows = await _db.WarehouseTasks
            .AsNoTracking()
            .ToListAsync();

        var byStatus = rows
            .GroupBy(x => x.Status.ToString())
            .ToDictionary(g => g.Key, g => g.Count());

        var byType = rows
            .GroupBy(x => x.Type.ToString())
            .Select(g =>
            {
                var completed = g.Where(x => x.StartedAt.HasValue && x.CompletedAt.HasValue).ToList();
                var avgLeadTimeSeconds = completed.Count == 0
                    ? 0
                    : completed.Average(x => Math.Max(0, (x.CompletedAt!.Value - x.StartedAt!.Value).TotalSeconds));

                return new
                {
                    type = g.Key,
                    total = g.Count(),
                    open = g.Count(x => x.Status == WarehouseTaskStatus.Open),
                    inProgress = g.Count(x => x.Status == WarehouseTaskStatus.InProgress),
                    done = g.Count(x => x.Status == WarehouseTaskStatus.Done),
                    cancelled = g.Count(x => x.Status == WarehouseTaskStatus.Cancelled),
                    blocked = g.Count(x => x.Status == WarehouseTaskStatus.Blocked),
                    avgLeadTimeSeconds = Math.Round(avgLeadTimeSeconds, 0)
                };
            })
            .ToList();

        return Ok(new
        {
            total = rows.Count,
            byStatus,
            byType
        });
    }

    [HttpGet("daily-report")]
    public async Task<ActionResult<WarehouseTaskDailyReportDto>> DailyReport()
    {
        var today = DateTime.UtcNow.Date;
        var tomorrow = today.AddDays(1);

        var createdToday = await _db.WarehouseTasks
            .AsNoTracking()
            .Include(x => x.AssignedToUser)
            .Where(x => x.CreatedAt >= today && x.CreatedAt < tomorrow)
            .ToListAsync();

        var assignedToday = await _db.WarehouseTasks
            .AsNoTracking()
            .Include(x => x.AssignedToUser)
            .Where(x => x.AssignedAt.HasValue && x.AssignedAt.Value >= today && x.AssignedAt.Value < tomorrow)
            .ToListAsync();

        var touchedToday = await _db.WarehouseTasks
            .AsNoTracking()
            .Include(x => x.AssignedToUser)
            .Where(x =>
                (x.StartedAt.HasValue && x.StartedAt.Value >= today && x.StartedAt.Value < tomorrow) ||
                (x.CompletedAt.HasValue && x.CompletedAt.Value >= today && x.CompletedAt.Value < tomorrow) ||
                (x.UpdatedAt >= today && x.UpdatedAt < tomorrow && x.Status == WarehouseTaskStatus.Blocked))
            .ToListAsync();

        var combined = createdToday
            .Concat(assignedToday)
            .Concat(touchedToday)
            .GroupBy(x => x.Id)
            .Select(g => g.First())
            .ToList();

        var workerRows = combined
            .Where(x => x.AssignedToUserId.HasValue)
            .GroupBy(x => new
            {
                x.AssignedToUserId,
                WorkerName = x.AssignedToUser != null
                    ? (string.IsNullOrWhiteSpace(x.AssignedToUser.Username) ? x.AssignedToUser.Email : x.AssignedToUser.Username)
                    : "Punetor i panjohur"
            })
            .Select(g => new WarehouseTaskWorkerDailyReportDto
            {
                UserId = g.Key.AssignedToUserId,
                WorkerName = g.Key.WorkerName ?? "Punetor i panjohur",
                Completed = g.Count(x => x.CompletedAt.HasValue && x.CompletedAt.Value >= today && x.CompletedAt.Value < tomorrow),
                InProgress = g.Count(x => x.Status == WarehouseTaskStatus.InProgress),
                Problems = g.Count(x => x.Status == WarehouseTaskStatus.Blocked && x.UpdatedAt >= today && x.UpdatedAt < tomorrow)
            })
            .OrderByDescending(x => x.Completed)
            .ThenByDescending(x => x.InProgress)
            .ThenByDescending(x => x.Problems)
            .ThenBy(x => x.WorkerName)
            .ToList();

        return Ok(new WarehouseTaskDailyReportDto
        {
            Date = today,
            OpenedToday = createdToday.Count,
            AssignedToday = assignedToday.Count,
            InProgressToday = combined.Count(x => x.Status == WarehouseTaskStatus.InProgress),
            CompletedToday = touchedToday.Count(x => x.CompletedAt.HasValue && x.CompletedAt.Value >= today && x.CompletedAt.Value < tomorrow),
            ProblemToday = touchedToday.Count(x => x.Status == WarehouseTaskStatus.Blocked && x.UpdatedAt >= today && x.UpdatedAt < tomorrow),
            Workers = workerRows
        });
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var task = await _db.WarehouseTasks
            .AsNoTracking()
            .Include(x => x.Product)
            .Include(x => x.FromBin)
            .Include(x => x.ToBin)
            .Include(x => x.AssignedToUser)
            .FirstOrDefaultAsync(x => x.Id == id);

        return task is null ? NotFound("Task-u nuk u gjet.") : Ok(ToDto(task));
    }

    [Authorize(Policy = "CanEditDocuments")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateWarehouseTaskRequest req)
    {
        if (req.Quantity.HasValue && req.Quantity.Value <= 0)
            return BadRequest("Sasia duhet te jete me e madhe se 0.");

        var task = new WarehouseTask
        {
            TaskNo = string.Empty,
            Type = req.Type,
            Status = WarehouseTaskStatus.Open,
            ProductId = req.ProductId,
            FromBinId = req.FromBinId,
            ToBinId = req.ToBinId,
            Quantity = req.Quantity,
            AssignedToUserId = req.AssignedToUserId,
            AssignedAt = req.AssignedToUserId.HasValue ? DateTime.UtcNow : null,
            Reference = NormalizeText(req.Reference),
            Note = NormalizeText(req.Note)
        };

        await SaveNewTasksWithRetryAsync([task]);

        await _audit.WriteAsync("CREATE_WAREHOUSE_TASK", "WarehouseTask", task.Id.ToString(), $"TaskNo={task.TaskNo}, Type={task.Type}");

        return CreatedAtAction(nameof(GetById), new { id = task.Id }, await BuildDtoAsync(task.Id));
    }

    [Authorize(Policy = "CanEditDocuments")]
    [HttpPost("generate/putaway/{documentRef}")]
    public async Task<IActionResult> GeneratePutaway(string documentRef, [FromBody] AssignWarehouseTaskRequest? req = null, [FromQuery] bool force = false)
    {
        var doc = await ResolveInboundByRefAsync(documentRef);

        if (doc is null)
            return NotFound("Dokumenti inbound nuk u gjet. Perdor DocumentNo (p.sh. IN-000055) ose GUID.");
        if (doc.Status != DocumentStatus.Confirmed)
            return BadRequest("Task-et putaway gjenerohen vetem per dokumente inbound te konfirmuara.");
        if (doc.Lines.Count == 0)
            return BadRequest("Dokumenti inbound nuk ka rreshta.");
        if (!force && await HasGeneratedTasksAsync(WarehouseTaskType.Putaway, doc.DocumentNo))
            return Conflict($"Task-et Putaway per dokumentin {doc.DocumentNo} jane gjeneruar tashme.");
        if (force)
        {
            var cleanup = await CleanupForRegenerateAsync(WarehouseTaskType.Putaway, doc.DocumentNo);
            if (!cleanup.ok)
                return Conflict(cleanup.error);
        }

        var created = new List<WarehouseTask>();
        foreach (var line in doc.Lines.Where(x => x.Quantity > 0))
        {
            var task = new WarehouseTask
            {
                TaskNo = string.Empty,
                Type = WarehouseTaskType.Putaway,
                Status = WarehouseTaskStatus.Open,
                ProductId = line.ProductId,
                ToBinId = line.ToBinId,
                Quantity = line.Quantity,
                AssignedToUserId = req?.AssignedToUserId,
                AssignedAt = req?.AssignedToUserId.HasValue == true ? DateTime.UtcNow : null,
                Reference = doc.DocumentNo,
                Note = $"Putaway nga dokumenti {doc.DocumentNo}"
            };
            created.Add(task);
        }

        await SaveNewTasksWithRetryAsync(created);

        await _audit.WriteAsync("GENERATE_PUTAWAY_TASKS", "InboundDocument", doc.Id.ToString(), $"DocumentNo={doc.DocumentNo}, Tasks={created.Count}");
        return Ok(new { created = created.Count, tasks = created.Select(ToDto).ToList() });
    }

    [Authorize(Policy = "CanEditDocuments")]
    [HttpPost("generate/picking/{documentRef}")]
    public async Task<IActionResult> GeneratePicking(string documentRef, [FromBody] AssignWarehouseTaskRequest? req = null, [FromQuery] bool force = false)
    {
        var doc = await ResolveOutboundByRefAsync(documentRef);

        if (doc is null)
            return NotFound("Dokumenti outbound nuk u gjet. Perdor DocumentNo (p.sh. OUT-000025) ose GUID.");
        if (doc.Status != DocumentStatus.Confirmed)
            return BadRequest("Task-et picking gjenerohen vetem per dokumente outbound te konfirmuara.");
        if (doc.Lines.Count == 0)
            return BadRequest("Dokumenti outbound nuk ka rreshta.");
        if (!force && await HasGeneratedTasksAsync(WarehouseTaskType.Picking, doc.DocumentNo))
            return Conflict($"Task-et Picking per dokumentin {doc.DocumentNo} jane gjeneruar tashme.");
        if (force)
        {
            var cleanup = await CleanupForRegenerateAsync(WarehouseTaskType.Picking, doc.DocumentNo);
            if (!cleanup.ok)
                return Conflict(cleanup.error);
        }

        var created = new List<WarehouseTask>();
        foreach (var line in doc.Lines.Where(x => x.Quantity > 0))
        {
            var task = new WarehouseTask
            {
                TaskNo = string.Empty,
                Type = WarehouseTaskType.Picking,
                Status = WarehouseTaskStatus.Open,
                ProductId = line.ProductId,
                FromBinId = line.FromBinId,
                Quantity = line.Quantity,
                AssignedToUserId = req?.AssignedToUserId,
                AssignedAt = req?.AssignedToUserId.HasValue == true ? DateTime.UtcNow : null,
                Reference = doc.DocumentNo,
                Note = $"Picking nga dokumenti {doc.DocumentNo}"
            };
            created.Add(task);
        }

        await SaveNewTasksWithRetryAsync(created);

        await _audit.WriteAsync("GENERATE_PICKING_TASKS", "OutboundDocument", doc.Id.ToString(), $"DocumentNo={doc.DocumentNo}, Tasks={created.Count}");
        return Ok(new { created = created.Count, tasks = created.Select(ToDto).ToList() });
    }

    [Authorize(Policy = "CanEditDocuments")]
    [HttpPost("generate/counting/{countRef}")]
    public async Task<IActionResult> GenerateCounting(string countRef, [FromBody] AssignWarehouseTaskRequest? req = null, [FromQuery] bool force = false)
    {
        var count = await ResolveCycleCountByRefAsync(countRef);

        if (count is null)
            return NotFound("Cycle count nuk u gjet. Perdor CountNo (p.sh. NR-000006) ose GUID.");
        if (count.Status != CycleCountStatus.Draft)
            return BadRequest("Task-et counting gjenerohen vetem per cycle count draft.");
        if (count.Lines.Count == 0)
            return BadRequest("Cycle count nuk ka rreshta.");
        if (!force && await HasGeneratedTasksAsync(WarehouseTaskType.Counting, count.CountNo))
            return Conflict($"Task-et Counting per numerimin {count.CountNo} jane gjeneruar tashme.");
        if (force)
        {
            var cleanup = await CleanupForRegenerateAsync(WarehouseTaskType.Counting, count.CountNo);
            if (!cleanup.ok)
                return Conflict(cleanup.error);
        }

        var created = new List<WarehouseTask>();
        foreach (var line in count.Lines)
        {
            var task = new WarehouseTask
            {
                TaskNo = string.Empty,
                Type = WarehouseTaskType.Counting,
                Status = WarehouseTaskStatus.Open,
                ProductId = line.ProductId,
                FromBinId = line.BinId,
                ToBinId = line.BinId,
                Quantity = line.ExpectedQty,
                AssignedToUserId = req?.AssignedToUserId,
                AssignedAt = req?.AssignedToUserId.HasValue == true ? DateTime.UtcNow : null,
                Reference = count.CountNo,
                Note = $"Counting nga numerimi {count.CountNo}"
            };
            created.Add(task);
        }

        await SaveNewTasksWithRetryAsync(created);

        await _audit.WriteAsync("GENERATE_COUNTING_TASKS", "CycleCount", count.Id.ToString(), $"CountNo={count.CountNo}, Tasks={created.Count}");
        return Ok(new { created = created.Count, tasks = created.Select(ToDto).ToList() });
    }

    [Authorize(Policy = "CanEditDocuments")]
    [HttpPost("{id:guid}/assign")]
    public async Task<IActionResult> Assign(Guid id, [FromBody] AssignWarehouseTaskRequest req)
    {
        var task = await _db.WarehouseTasks.FirstOrDefaultAsync(x => x.Id == id);
        if (task is null)
            return NotFound("Task-u nuk u gjet.");

        if (task.Status == WarehouseTaskStatus.Done || task.Status == WarehouseTaskStatus.Cancelled)
            return BadRequest("Nuk mund te ndryshohet operatori per task te mbyllur.");

        var wasAssignedToDifferentUser = task.AssignedToUserId != req.AssignedToUserId;
        task.AssignedToUserId = req.AssignedToUserId;
        if (wasAssignedToDifferentUser)
            task.AssignedAt = req.AssignedToUserId.HasValue ? DateTime.UtcNow : null;
        task.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _audit.WriteAsync("ASSIGN_WAREHOUSE_TASK", "WarehouseTask", task.Id.ToString(), $"TaskNo={task.TaskNo}, AssignedTo={task.AssignedToUserId}");

        return Ok(await BuildDtoAsync(task.Id));
    }

    [Authorize(Policy = "CanEditDocuments")]
    [HttpPost("{id:guid}/problem")]
    public async Task<IActionResult> ReportProblem(Guid id, [FromBody] ReportWarehouseTaskProblemRequest req)
    {
        var reason = NormalizeText(req.Reason);
        if (string.IsNullOrWhiteSpace(reason))
            return BadRequest("Shkruaj arsyen pse puna nuk mund te kryhet.");

        var task = await _db.WarehouseTasks.FirstOrDefaultAsync(x => x.Id == id);
        if (task is null)
            return NotFound("Task-u nuk u gjet.");

        if (task.Status == WarehouseTaskStatus.Done)
            return BadRequest("Puna e perfunduar nuk mund te shenohet si problem.");
        if (task.Status == WarehouseTaskStatus.Cancelled)
            return BadRequest("Puna e anuluar nuk mund te shenohet si problem.");

        var stamp = DateTime.Now.ToString("dd.MM.yyyy HH:mm");
        var problemNote = $"Problem ({stamp}): {reason}";
        task.Note = string.IsNullOrWhiteSpace(task.Note)
            ? problemNote
            : $"{task.Note} | {problemNote}";
        task.Status = WarehouseTaskStatus.Blocked;
        task.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _audit.WriteAsync("REPORT_WAREHOUSE_TASK_PROBLEM", "WarehouseTask", task.Id.ToString(), $"TaskNo={task.TaskNo}, Reason={reason}");

        return Ok(await BuildDtoAsync(task.Id));
    }

    [Authorize(Policy = "CanEditDocuments")]
    [HttpPost("{id:guid}/help-request")]
    public async Task<IActionResult> RequestHelp(Guid id, [FromBody] RequestWarehouseTaskHelpRequest req)
    {
        var reason = NormalizeText(req.Reason);
        if (string.IsNullOrWhiteSpace(reason))
            return BadRequest("Shkruaj pse te duhet ndihme.");

        var task = await _db.WarehouseTasks.FirstOrDefaultAsync(x => x.Id == id);
        if (task is null)
            return NotFound("Task-u nuk u gjet.");

        if (task.Status == WarehouseTaskStatus.Done)
            return BadRequest("Puna e perfunduar nuk mund te kerkoje ndihme.");
        if (task.Status == WarehouseTaskStatus.Cancelled)
            return BadRequest("Puna e anuluar nuk mund te kerkoje ndihme.");

        task.HelpRequestedAt = DateTime.UtcNow;
        task.HelpResolvedAt = null;
        task.HelpRequestNote = reason;
        task.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _audit.WriteAsync("REQUEST_WAREHOUSE_TASK_HELP", "WarehouseTask", task.Id.ToString(), $"TaskNo={task.TaskNo}, Reason={reason}");

        return Ok(await BuildDtoAsync(task.Id));
    }

    [Authorize(Policy = "CanEditDocuments")]
    [HttpPost("{id:guid}/help-resolve")]
    public async Task<IActionResult> ResolveHelp(Guid id)
    {
        var task = await _db.WarehouseTasks.FirstOrDefaultAsync(x => x.Id == id);
        if (task is null)
            return NotFound("Task-u nuk u gjet.");

        if (!task.HelpRequestedAt.HasValue || task.HelpResolvedAt.HasValue)
            return BadRequest("Kjo pune nuk ka kerkese ndihme aktive.");

        task.HelpResolvedAt = DateTime.UtcNow;
        task.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _audit.WriteAsync("RESOLVE_WAREHOUSE_TASK_HELP", "WarehouseTask", task.Id.ToString(), $"TaskNo={task.TaskNo}");

        return Ok(await BuildDtoAsync(task.Id));
    }

    [Authorize(Policy = "CanEditDocuments")]
    [HttpPost("{id:guid}/start")]
    public async Task<IActionResult> Start(Guid id)
    {
        var task = await _db.WarehouseTasks.FirstOrDefaultAsync(x => x.Id == id);
        if (task is null)
            return NotFound("Task-u nuk u gjet.");

        if (task.Status != WarehouseTaskStatus.Open && task.Status != WarehouseTaskStatus.Blocked)
            return BadRequest("Vetem task-et open ose te bllokuara mund te nisen.");

        task.Status = WarehouseTaskStatus.InProgress;
        task.StartedAt = DateTime.UtcNow;
        task.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _audit.WriteAsync("START_WAREHOUSE_TASK", "WarehouseTask", task.Id.ToString(), $"TaskNo={task.TaskNo}");

        return Ok(await BuildDtoAsync(task.Id));
    }

    [Authorize(Policy = "CanEditDocuments")]
    [HttpPost("{id:guid}/complete")]
    public async Task<IActionResult> Complete(Guid id)
    {
        var task = await _db.WarehouseTasks.FirstOrDefaultAsync(x => x.Id == id);
        if (task is null)
            return NotFound("Task-u nuk u gjet.");

        if (task.Status == WarehouseTaskStatus.Done)
            return BadRequest("Task-u eshte perfunduar tashme.");
        if (task.Status == WarehouseTaskStatus.Cancelled)
            return BadRequest("Task-u i anuluar nuk mund te perfundohet.");
        if (task.Status == WarehouseTaskStatus.Blocked)
            return BadRequest("Puna me problem duhet te niset perseri para se te perfundohet.");

        await using var tx = await _db.Database.BeginTransactionAsync();

        if (task.Type == WarehouseTaskType.Replenishment)
        {
            var transferError = await ExecuteReplenishmentTransferAsync(task, GetUserIdOrNull());
            if (transferError is not null)
            {
                await tx.RollbackAsync();
                return BadRequest(transferError);
            }
        }

        if (!task.StartedAt.HasValue)
            task.StartedAt = DateTime.UtcNow;

        task.Status = WarehouseTaskStatus.Done;
        task.CompletedAt = DateTime.UtcNow;
        task.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        await _audit.WriteAsync("COMPLETE_WAREHOUSE_TASK", "WarehouseTask", task.Id.ToString(), $"TaskNo={task.TaskNo}");

        return Ok(await BuildDtoAsync(task.Id));
    }

    [Authorize(Policy = "CanEditDocuments")]
    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id)
    {
        var task = await _db.WarehouseTasks.FirstOrDefaultAsync(x => x.Id == id);
        if (task is null)
            return NotFound("Task-u nuk u gjet.");

        if (task.Status == WarehouseTaskStatus.Done)
            return BadRequest("Task-u i perfunduar nuk mund te anulohet.");
        if (task.Status == WarehouseTaskStatus.Cancelled)
            return BadRequest("Task-u eshte anuluar tashme.");

        task.Status = WarehouseTaskStatus.Cancelled;
        task.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _audit.WriteAsync("CANCEL_WAREHOUSE_TASK", "WarehouseTask", task.Id.ToString(), $"TaskNo={task.TaskNo}");

        return Ok(await BuildDtoAsync(task.Id));
    }

    private async Task<WarehouseTaskDto?> BuildDtoAsync(Guid id)
    {
        var task = await _db.WarehouseTasks
            .AsNoTracking()
            .Include(x => x.Product)
            .Include(x => x.FromBin)
            .Include(x => x.ToBin)
            .Include(x => x.AssignedToUser)
            .FirstOrDefaultAsync(x => x.Id == id);

        return task is null ? null : ToDto(task);
    }

    private async Task SaveNewTasksWithRetryAsync(List<WarehouseTask> tasks)
    {
        if (tasks.Count == 0) return;

        for (var attempt = 1; attempt <= 3; attempt++)
        {
            var taskNos = await AllocateTaskNosAsync(tasks.Count);
            for (var i = 0; i < tasks.Count; i++)
                tasks[i].TaskNo = taskNos[i];

            try
            {
                if (attempt == 1)
                    _db.WarehouseTasks.AddRange(tasks);

                await _db.SaveChangesAsync();
                return;
            }
            catch (DbUpdateException ex) when (IsDuplicateTaskNo(ex) && attempt < 3)
            {
                foreach (var entry in ex.Entries)
                    entry.State = EntityState.Added;
            }
        }

        throw new InvalidOperationException("Nuk u gjenerua dot TaskNo unik pas disa tentativave.");
    }

    private async Task<List<string>> AllocateTaskNosAsync(int count)
    {
        var latest = await _db.WarehouseTasks
            .AsNoTracking()
            .OrderByDescending(x => x.TaskNo)
            .Select(x => x.TaskNo)
            .FirstOrDefaultAsync();

        var next = 1;
        if (!string.IsNullOrWhiteSpace(latest) &&
            latest.StartsWith("VEP-", StringComparison.OrdinalIgnoreCase) &&
            int.TryParse(latest[4..], out var parsed) &&
            parsed >= 0)
        {
            next = parsed + 1;
        }

        var result = new List<string>(count);
        for (var i = 0; i < count; i++)
            result.Add($"VEP-{(next + i):D6}");

        return result;
    }

    private static bool IsDuplicateTaskNo(DbUpdateException ex)
    {
        return ex.InnerException is SqlException sqlEx &&
               (sqlEx.Number == 2601 || sqlEx.Number == 2627);
    }

    private Task<bool> HasGeneratedTasksAsync(WarehouseTaskType type, string documentNo)
    {
        return _db.WarehouseTasks.AnyAsync(x =>
            x.Type == type &&
            x.Reference == documentNo);
    }

    private async Task<(bool ok, string? error)> CleanupForRegenerateAsync(WarehouseTaskType type, string reference)
    {
        var existing = await _db.WarehouseTasks
            .Where(x => x.Type == type && x.Reference == reference)
            .ToListAsync();

        if (existing.Any(x => x.Status == WarehouseTaskStatus.InProgress))
            return (false, "Nuk mund te rigjenerohet: ka task-e ne progres.");

        foreach (var task in existing.Where(x => x.Status == WarehouseTaskStatus.Open))
        {
            task.Status = WarehouseTaskStatus.Cancelled;
            task.Note = string.IsNullOrWhiteSpace(task.Note)
                ? "Anuluar automatikisht nga Regjenero."
                : $"{task.Note} | Anuluar automatikisht nga Regjenero.";
            task.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();
        return (true, null);
    }

    private static WarehouseTaskDto ToDto(WarehouseTask task)
    {
        long? leadTime = null;
        if (task.StartedAt.HasValue && task.CompletedAt.HasValue)
            leadTime = (long)Math.Max(0, (task.CompletedAt.Value - task.StartedAt.Value).TotalSeconds);

        return new WarehouseTaskDto
        {
            Id = task.Id,
            TaskNo = task.TaskNo,
            Type = task.Type.ToString(),
            Status = task.Status.ToString(),
            ProductId = task.ProductId,
            ProductSku = task.Product?.Sku,
            ProductName = task.Product?.Name,
            FromBinId = task.FromBinId,
            FromBinCode = task.FromBin?.Code,
            ToBinId = task.ToBinId,
            ToBinCode = task.ToBin?.Code,
            Quantity = task.Quantity,
            AssignedToUserId = task.AssignedToUserId,
            AssignedToUsername = task.AssignedToUser?.Username,
            AssignedAt = task.AssignedAt,
            CreatedAt = task.CreatedAt,
            UpdatedAt = task.UpdatedAt ?? task.CreatedAt,
            StartedAt = task.StartedAt,
            CompletedAt = task.CompletedAt,
            HelpRequestedAt = task.HelpRequestedAt,
            HelpResolvedAt = task.HelpResolvedAt,
            LeadTimeSeconds = leadTime,
            Reference = task.Reference,
            Note = task.Note,
            HelpRequestNote = task.HelpRequestNote
        };
    }

    private static string? NormalizeText(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private Guid? GetUserIdOrNull()
    {
        var s = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(s, out var id) ? id : null;
    }

    private async Task<string?> ExecuteReplenishmentTransferAsync(WarehouseTask task, Guid? userId)
    {
        if (!task.ProductId.HasValue || !task.FromBinId.HasValue || !task.ToBinId.HasValue || !task.Quantity.HasValue)
            return "Task-u i rimbushjes nuk ka te dhena te plota (produkt/shporta/sasi).";

        var qty = task.Quantity.Value;
        if (qty <= 0)
            return "Sasia e rimbushjes duhet te jete me e madhe se 0.";
        if (task.FromBinId.Value == task.ToBinId.Value)
            return "Shporta burim dhe destinacion nuk mund te jene te njejta.";

        var fromRows = await _db.Inventories
            .Where(i => i.ProductId == task.ProductId.Value && i.BinId == task.FromBinId.Value)
            .OrderByDescending(i => i.QtyOnHand - i.QtyReserved)
            .ToListAsync();

        if (fromRows.Count == 0)
            return "Nuk ka stok burim ne shporten 'Nga' per kete produkt.";

        var totalAvailable = fromRows.Sum(i => Math.Max(i.QtyOnHand - i.QtyReserved, 0));
        if (totalAvailable < qty)
            return $"Stoku i disponueshem ne shporten burim nuk mjafton. Nevoje: {qty:0.##}, Disponueshem: {totalAvailable:0.##}.";

        var toRow = await _db.Inventories
            .FirstOrDefaultAsync(i =>
                i.ProductId == task.ProductId.Value &&
                i.BinId == task.ToBinId.Value &&
                i.LotNumber == null &&
                i.BatchNumber == null &&
                i.ExpiryDate == null);

        if (toRow is null)
        {
            toRow = new Inventory
            {
                ProductId = task.ProductId.Value,
                BinId = task.ToBinId.Value,
                LotNumber = null,
                BatchNumber = null,
                ExpiryDate = null,
                QtyOnHand = 0,
                QtyReserved = 0,
                CreatedAt = DateTime.UtcNow
            };
            _db.Inventories.Add(toRow);
        }

        var remaining = qty;
        foreach (var row in fromRows)
        {
            if (remaining <= 0) break;

            var available = row.QtyOnHand - row.QtyReserved;
            if (available <= 0) continue;

            var take = Math.Min(available, remaining);
            row.QtyOnHand -= take;

            if (row.QtyOnHand < 0)
                return "Stoku nuk mund te shkoje nen 0 ne shporten burim.";
            if (row.QtyReserved > row.QtyOnHand)
                return "Rezervimet ekzistuese tejkalojne stokun pas levizjes.";

            row.UpdatedAt = DateTime.UtcNow;
            remaining -= take;
        }

        if (remaining > 0)
            return "Nuk u realizua transferi i plote per shkak te ndryshimeve ne stok.";

        toRow.QtyOnHand += qty;
        toRow.UpdatedAt = DateTime.UtcNow;

        _db.StockMovements.Add(new StockMovement
        {
            Type = StockMovementType.TRANSFER,
            ProductId = task.ProductId.Value,
            FromBinId = task.FromBinId.Value,
            ToBinId = task.ToBinId.Value,
            Quantity = qty,
            Reference = string.IsNullOrWhiteSpace(task.Reference) ? task.TaskNo : task.Reference,
            Note = $"Rimbushje automatike e perfunduar nga task {task.TaskNo}.",
            PerformedByUserId = userId
        });

        return null;
    }

    private async Task<InboundDocument?> ResolveInboundByRefAsync(string reference)
    {
        var trimmed = NormalizeText(reference);
        if (trimmed is null) return null;

        if (Guid.TryParse(trimmed, out var id))
        {
            return await _db.InboundDocuments
                .Include(x => x.Lines)
                .FirstOrDefaultAsync(x => x.Id == id);
        }

        return await _db.InboundDocuments
            .Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.DocumentNo == trimmed);
    }

    private async Task<OutboundDocument?> ResolveOutboundByRefAsync(string reference)
    {
        var trimmed = NormalizeText(reference);
        if (trimmed is null) return null;

        if (Guid.TryParse(trimmed, out var id))
        {
            return await _db.OutboundDocuments
                .Include(x => x.Lines)
                .FirstOrDefaultAsync(x => x.Id == id);
        }

        return await _db.OutboundDocuments
            .Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.DocumentNo == trimmed);
    }

    private async Task<CycleCount?> ResolveCycleCountByRefAsync(string reference)
    {
        var trimmed = NormalizeText(reference);
        if (trimmed is null) return null;

        if (Guid.TryParse(trimmed, out var id))
        {
            return await _db.CycleCounts
                .Include(x => x.Lines)
                .FirstOrDefaultAsync(x => x.Id == id);
        }

        return await _db.CycleCounts
            .Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.CountNo == trimmed);
    }
}
