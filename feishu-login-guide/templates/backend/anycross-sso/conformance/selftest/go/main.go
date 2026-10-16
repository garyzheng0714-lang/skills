// 自测用的最小 Go 项目：照 README 的接法挂上模板，供 selftest.sh 跑合规测试。
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"selftest/internal/auth"
)

func main() {
	store, err := auth.NewFileStore(filepath.Join(os.Getenv("CONFORMANCE_DATA_DIR"), "sso.json"))
	if err != nil {
		log.Fatal(err)
	}
	sso, err := auth.New(context.Background(), auth.Options{
		Store:   store,
		OnLogin: func(ctx context.Context, id auth.Identity) (string, error) { return id.Key(), nil },
	})
	if err != nil {
		log.Fatal(err)
	}
	mux := http.NewServeMux()
	sso.Register(mux)
	mux.Handle("GET /api/export", sso.RequireUser(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("export for " + auth.CurrentUser(r).ID))
	})))
	mux.Handle("GET /api/sensitive", sso.RequireFreshUser(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})))
	log.Fatal(http.ListenAndServe("127.0.0.1:"+os.Getenv("PORT"), mux))
}
