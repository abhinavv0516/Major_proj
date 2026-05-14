from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.models import Base

SQLALCHEMY_DATABASE_URL = "sqlite:///./sql_app.db"
# For MySQL: "mysql+pymysql://user:password@localhost/dbname"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False} # check_same_thread is needed for SQLite
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    Base.metadata.create_all(bind=engine)
