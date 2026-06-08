using System.Net.Http.Headers;
using System.Text;

    // 1. Ndrysho këto 3 vlera:
    var baseUrl = "https://localhost:5079";
    var docId = "A0BFE263-F3E0-4080-80CC-FE0D77EFCD59";
    var token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJodHRwOi8vc2NoZW1hcy54bWxzb2FwLm9yZy93cy8yMDA1LzA1L2lkZW50aXR5L2NsYWltcy9uYW1laWRlbnRpZmllciI6IjZlY2M5NDI3LWI4MGYtNDZkMC05MjAxLTcxNmJkYzhiYTI3MSIsImh0dHA6Ly9zY2hlbWFzLnhtbHNvYXAub3JnL3dzLzIwMDUvMDUvaWRlbnRpdHkvY2xhaW1zL2VtYWlsYWRkcmVzcyI6ImhhbmEuZGVtYWpAZmFtaWx5LmNvbSIsImh0dHA6Ly9zY2hlbWFzLm1pY3Jvc29mdC5jb20vd3MvMjAwOC8wNi9pZGVudGl0eS9jbGFpbXMvcm9sZSI6Ik1hbmFnZXIiLCJleHAiOjE3Njg3NTI3NTAsImlzcyI6IlNNRC5BUEkiLCJhdWQiOiJTTUQuQ2xpZW50In0.nfAToOczIf7nfhh1KXquih3Gp0Z1c1z-Bkp3KJ8KYNg";

    var url = $"{baseUrl}/api/inbound-documents/{docId}/confirmTask";

    using var http = new HttpClient();
    http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

    // Optional: e bëjmë payload bosh (endpoint yt s’pret body)
    var content = new StringContent("", Encoding.UTF8, "application/json");

    async Task<(int status, string body)> CallAsync()
    {
        var res = await http.PostAsync(url, content);
        var body = await res.Content.ReadAsStringAsync();
        return ((int)res.StatusCode, body);
    }

    Console.WriteLine("Sending 2 parallel confirm requests...");

    // 2. Këtu ndodhin 2 thirrje paralel (race condition)
    var t1 = CallAsync();
    var t2 = CallAsync();

    var results = await Task.WhenAll(t1, t2);

    Console.WriteLine($"REQ-1: {results[0].status} | {results[0].body}");
    Console.WriteLine($"REQ-2: {results[1].status} | {results[1].body}");

    Console.WriteLine("Done.");
